import { normalizeCategory, getCategorySlugFromPath, getCategoryLabel } from "./story-utils.js";

const STORAGE_KEY = "ivy-leaf-reports";
const REMOTE_STORAGE_URL = "https://jsonblob.com/api/jsonBlob/019f7533-2a92-7c17-9b9c-d3e9ef99cb87";
const OWNER_PASSWORD = "FlWkOtLcAlPjOSoKe3f343v3r4212";
const reportForm = document.getElementById("report-form");
const unlockForm = document.getElementById("unlock-form");
const reportList = document.getElementById("report-list");
const uploadFormWrapper = document.getElementById("upload-form-wrapper");
const unlockPanel = document.getElementById("unlock-panel");
const unlockMessage = document.getElementById("unlock-message");
const managePanel = document.getElementById("manage-panel");
const DELETED_STORY_IDS_KEY = "ivy-leaf-deleted-story-ids";
const MAX_STORED_FILE_DATA_BYTES = 1_200_000;

let deletedStoryIds = loadDeletedStoryIds();
let reports = loadReports();
let isUnlocked = sessionStorage.getItem("ivy-leaf-unlocked") === "true";
let isSyncing = false;
let syncError = "";
const expandedStoryIds = new Set();
const currentCategorySlug = getCategorySlugFromPath(window.location.pathname);

if (isUnlocked && uploadFormWrapper && unlockPanel) {
  showUploadForm();
}

if (isUnlocked && managePanel) {
  managePanel.classList.remove("hidden");
}

if (unlockForm && unlockMessage) {
  unlockForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const passwordInput = new FormData(unlockForm).get("password");
    const enteredPassword = passwordInput ? passwordInput.toString().trim() : "";

    if (enteredPassword === OWNER_PASSWORD) {
      sessionStorage.setItem("ivy-leaf-unlocked", "true");
      isUnlocked = true;
      showUploadForm();
      if (managePanel) {
        managePanel.classList.remove("hidden");
      }
      unlockMessage.textContent = "Owner tools unlocked. You can add or remove stories.";
    } else {
      unlockMessage.textContent = "Incorrect password. Only the owner can add stories.";
    }
  });
}

if (reportForm) {
  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(reportForm);
    const title = formData.get("title").toString().trim();
    const category = formData.get("category").toString().trim();
    const sourceUrl = formData.get("sourceUrl").toString().trim();
    const notes = formData.get("notes").toString().trim();
    const files = Array.from(formData.getAll("file")).filter((file) => file && file.size > 0);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (!isUnlocked) {
      alert("Please unlock the upload panel first.");
      return;
    }

    if (!title) {
      return;
    }

    if (!sourceUrl && !imageFiles.length && !notes) {
      alert("Add a source link, notes, or upload a screenshot.");
      return;
    }

    const gallery = imageFiles.length ? await readFilesAsDataUrl(imageFiles) : [];
    const firstImageData = gallery[0]?.fileData || "";
    const normalizedCategory = category
      ? normalizeCategory(category)
      : currentCategorySlug === "all"
        ? { slug: "all", label: "All stories" }
        : { slug: currentCategorySlug, label: getCategoryLabel(currentCategorySlug) };
    const safeFileData = sanitizeStoredFileData(firstImageData);

    const report = {
      id: crypto.randomUUID(),
      title,
      category: normalizedCategory.label,
      categorySlug: normalizedCategory.slug,
      sourceUrl,
      notes,
      createdAt: new Date().toISOString(),
      fileName: imageFiles[0]?.name || "",
      fileType: imageFiles[0]?.type || "",
      fileData: safeFileData,
      gallery: gallery.map((image) => ({
        fileName: image.fileName,
        fileType: image.fileType,
        fileData: sanitizeStoredFileData(image.fileData),
      })),
      readCount: 0,
      likeCount: 0,
    };

    reports = [report, ...reports];
    reportForm.reset();

    const targetPage = getCategoryPagePath(normalizedCategory.slug);

    try {
      await saveReports();
    } finally {
      window.location.assign(`${targetPage}?saved=1`);
    }
  });
}

function loadDeletedStoryIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORY_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Could not load deleted story IDs", error);
    return [];
  }
}

function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const loadedReports = raw ? JSON.parse(raw) : [];
    return loadedReports.filter((report) => !deletedStoryIds.includes(report.id));
  } catch (error) {
    console.error("Could not load reports", error);
    return [];
  }
}

function estimateDataUrlSize(value) {
  if (!value) {
    return 0;
  }

  const stringValue = String(value);
  return Math.ceil((stringValue.length * 3) / 4);
}

function sanitizeStoredFileData(fileData) {
  if (!fileData) {
    return "";
  }

  return estimateDataUrlSize(fileData) <= MAX_STORED_FILE_DATA_BYTES ? fileData : "";
}

function saveReportsToLocalStorage() {
  const storageReports = reports.map((report) => ({
    ...report,
    fileData: sanitizeStoredFileData(report.fileData),
    gallery: Array.isArray(report.gallery)
      ? report.gallery.map((image) => ({
          ...image,
          fileData: sanitizeStoredFileData(image.fileData),
        }))
      : [],
  }));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageReports));
    localStorage.setItem(DELETED_STORY_IDS_KEY, JSON.stringify(deletedStoryIds));
  } catch (error) {
    console.warn("Could not save the full uploaded archive to the browser. Saving metadata without large attachments.", error);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        storageReports.map((report) => ({
          ...report,
          fileData: "",
        }))
      )
    );
    localStorage.setItem(DELETED_STORY_IDS_KEY, JSON.stringify(deletedStoryIds));
  }
}

function getRemotePayload() {
  return reports
    .filter((report) => !deletedStoryIds.includes(report.id))
    .map((report) => {
      const { fileData, gallery, ...rest } = report;
      return {
        ...rest,
        fileData: "",
        gallery: [],
      };
    });
}

async function saveReports() {
  saveReportsToLocalStorage();

  try {
    const remoteSync = fetch(REMOTE_STORAGE_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getRemotePayload()),
    });

    await Promise.race([
      remoteSync,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Remote sync timed out")), 5000);
      }),
    ]);
  } catch (error) {
    console.warn("Could not sync reports to the shared archive", error);
  }
}

async function loadRemoteReports() {
  try {
    const response = await fetch(REMOTE_STORAGE_URL);

    if (!response.ok) {
      throw new Error(`Remote storage returned ${response.status}`);
    }

    const remoteReports = await response.json();
    return Array.isArray(remoteReports) ? remoteReports : [];
  } catch (error) {
    console.warn("Could not load reports from the shared archive", error);
    return [];
  }
}

function mergeReports(localReports, remoteReports, deletedIds = []) {
  const merged = new Map();
  const deletedIdSet = new Set(deletedIds);

  [...remoteReports, ...localReports].forEach((report) => {
    if (!report || !report.id || deletedIdSet.has(report.id)) {
      return;
    }

    const existing = merged.get(report.id);
    merged.set(report.id, existing ? { ...existing, ...report } : report);
  });

  return Array.from(merged.values()).sort((left, right) => {
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
}

function getSourceUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const trimmedUrl = rawUrl.trim();

  if (/https?:\/\/(www\.)?docs\.google\.com\//i.test(trimmedUrl)) {
    return `source-preview.html?url=${encodeURIComponent(trimmedUrl)}`;
  }

  if (/https?:\/\/drive\.google\.com\/file\/d\/[^/]+\/view/i.test(trimmedUrl)) {
    return `source-preview.html?url=${encodeURIComponent(trimmedUrl)}`;
  }

  if (/https?:\/\/drive\.google\.com\/open\?id=/i.test(trimmedUrl)) {
    return `source-preview.html?url=${encodeURIComponent(trimmedUrl)}`;
  }

  return trimmedUrl;
}

function getReadCountLabel(count) {
  const safeCount = Number(count) || 0;
  return `${safeCount} ${safeCount === 1 ? "person" : "people"} read this`;
}

function renderReports() {
  if (!reportList) {
    return;
  }

  const filteredReports = currentCategorySlug === "all"
    ? reports
    : reports.filter((report) => report.categorySlug === currentCategorySlug);

  if (isSyncing) {
    reportList.innerHTML = `
      <div class="empty-state">
        <p>Syncing the archive… stories will appear shortly.</p>
      </div>
    `;
    return;
  }

  if (!filteredReports.length) {
    const emptyMessage = syncError
      ? `We could not load the shared archive right now. ${syncError}`
      : `No stories yet in ${getCategoryLabel(currentCategorySlug)}.`;

    reportList.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
      </div>
    `;
    return;
  }

  reportList.innerHTML = filteredReports
    .map((report) => {
      const previewMarkup = renderPreview(report);
      const sourceUrl = getSourceUrl(report.sourceUrl);
      const sourceMarkup = sourceUrl
        ? `<a href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noreferrer">Open public preview</a>`
        : "";
      const isExpanded = expandedStoryIds.has(report.id);
      const expandedMarkup = renderExpandedStory(report, isExpanded);

      const hasImageStory = !!(report.fileType && report.fileType.startsWith("image/")) || (Array.isArray(report.gallery) && report.gallery.length > 0);
      const fileDownloadMarkup = hasImageStory || !report.fileData
        ? ""
        : `<a href="${escapeAttribute(report.fileData)}" download="${escapeAttribute(report.fileName || "report")}">Download file</a>`;

      return `
        <article class="report-card">
          <span class="badge">${escapeHtml(report.category)}</span>
          <h3>${escapeHtml(report.title)}</h3>
          <p class="meta">Added ${new Date(report.createdAt).toLocaleDateString()}</p>
          <p class="engagement-meta">${escapeHtml(getReadCountLabel(report.readCount))} • ${escapeHtml(`${report.likeCount || 0} ${report.likeCount === 1 ? "like" : "likes"}`)}</p>
          ${report.notes ? `<p class="notes">${escapeHtml(report.notes)}</p>` : ""}
          ${sourceMarkup ? `<p>${sourceMarkup}</p>` : ""}
          ${previewMarkup}
          ${expandedMarkup}
          ${fileDownloadMarkup}
          <div class="card-actions">
            <button class="action-button read-button" data-id="${escapeAttribute(report.id)}" type="button">${isExpanded ? "Hide story" : "Read story"}</button>
            <button class="action-button like-button" data-id="${escapeAttribute(report.id)}" type="button">👍 ${escapeHtml(String(report.likeCount || 0))}</button>
          </div>
          ${isUnlocked ? `<button class="remove-button" data-id="${escapeAttribute(report.id)}" type="button">Remove story</button>` : ""}
        </article>
      `;
    })
    .join("");

  reportList.querySelectorAll(".remove-button").forEach((button) => {
    button.addEventListener("click", () => {
      removeStory(button.dataset.id);
    });
  });

  reportList.querySelectorAll(".read-button").forEach((button) => {
    button.addEventListener("click", () => {
      markStoryRead(button.dataset.id);
    });
  });

  reportList.querySelectorAll(".like-button").forEach((button) => {
    button.addEventListener("click", () => {
      likeStory(button.dataset.id);
    });
  });
}

function renderPreview(report) {
  const imageUrls = getStoryImages(report);

  if (!imageUrls.length) {
    return "";
  }

  const firstImage = imageUrls[0];
  if (report.fileType.startsWith("image/") || firstImage.startsWith("data:image/")) {
    return `<div class="preview"><img src="${escapeAttribute(firstImage)}" alt="${escapeHtml(report.title)}" /></div>`;
  }

  if (report.fileType === "application/pdf") {
    return `<div class="preview"><iframe src="${escapeAttribute(firstImage)}"></iframe></div>`;
  }

  return `<div class="preview"><p class="notes">Uploaded file: ${escapeHtml(report.fileName || "report")}</p></div>`;
}

function renderExpandedStory(report, isExpanded) {
  if (!isExpanded) {
    return "";
  }

  const imageUrls = getStoryImages(report);
  const storySummary = report.notes ? `<p class="story-copy">${escapeHtml(report.notes)}</p>` : "";
  const sourceUrl = report.sourceUrl ? getSourceUrl(report.sourceUrl) : "";
  const sourceMarkup = sourceUrl
    ? `<p><a href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noreferrer">Open source</a></p>`
    : "";
  const galleryMarkup = imageUrls.length
    ? `<div class="story-gallery">${imageUrls
        .map((imageUrl) => `<img src="${escapeAttribute(imageUrl)}" alt="${escapeHtml(report.title)}" />`)
        .join("")}</div>`
    : "";

  return `<div class="story-expanded">${storySummary}${sourceMarkup}${galleryMarkup}</div>`;
}

function getStoryImages(report) {
  if (Array.isArray(report.gallery) && report.gallery.length) {
    return report.gallery
      .map((entry) => entry.fileData)
      .filter(Boolean);
  }

  return report.fileData ? [report.fileData] : [];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

async function readFilesAsDataUrl(files) {
  const results = [];

  for (const file of files) {
    const fileData = await readFileAsDataUrl(file);
    results.push({
      fileName: file.name,
      fileType: file.type,
      fileData,
    });
  }

  return results;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(String(value)).replaceAll("`", "&#96;");
}

function showUploadForm() {
  if (uploadFormWrapper && unlockPanel) {
    uploadFormWrapper.classList.remove("hidden");
    unlockPanel.classList.add("hidden");
  }
}

async function markStoryRead(storyId) {
  const report = reports.find((entry) => entry.id === storyId);

  if (!report) {
    return;
  }

  report.readCount = (Number(report.readCount) || 0) + 1;

  if (report.notes || report.fileData || report.gallery?.length || report.sourceUrl) {
    if (expandedStoryIds.has(storyId)) {
      expandedStoryIds.delete(storyId);
    } else {
      expandedStoryIds.add(storyId);
    }
  }

  await saveReports();
  renderReports();
}

async function likeStory(storyId) {
  const report = reports.find((entry) => entry.id === storyId);

  if (!report) {
    return;
  }

  report.likeCount = (Number(report.likeCount) || 0) + 1;
  await saveReports();
  renderReports();
}

async function removeStory(storyId) {
  if (!isUnlocked) {
    alert("Please unlock owner tools first.");
    return;
  }

  if (!confirm("Remove this story from the archive?")) {
    return;
  }

  deletedStoryIds = Array.from(new Set([...deletedStoryIds, storyId]));
  reports = reports.filter((report) => report.id !== storyId);
  await saveReports();
  renderReports();
}

function getCategoryPagePath(categorySlug) {
  if (categorySlug === "urban-design") return "urban-design.html";
  if (categorySlug === "architecture") return "architecture.html";
  if (categorySlug === "engineering") return "engineering.html";
  if (categorySlug === "innovations") return "innovations.html";
  if (categorySlug === "environmental-reports") return "environmental-reports.html";
  if (categorySlug === "building-it-better") return "building-it-better.html";
  return "library.html";
}

async function initReports() {
  isSyncing = true;
  renderReports();

  try {
    const remoteReports = await loadRemoteReports();

    if (remoteReports.length || deletedStoryIds.length) {
      reports = mergeReports(reports, remoteReports, deletedStoryIds);
      saveReportsToLocalStorage();
    }

    syncError = "";
  } catch (error) {
    syncError = error.message;
  } finally {
    isSyncing = false;
    renderReports();
  }
}

initReports();
