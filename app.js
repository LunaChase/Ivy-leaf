import { normalizeCategory, getCategorySlugFromPath, getCategoryLabel } from "./story-utils.js";

const STORAGE_KEY = "ivy-leaf-reports";
const OWNER_PASSWORD = "FlWkOtLcAlPjOSoKe3f343v3r4212";
const reportForm = document.getElementById("report-form");
const unlockForm = document.getElementById("unlock-form");
const reportList = document.getElementById("report-list");
const uploadFormWrapper = document.getElementById("upload-form-wrapper");
const unlockPanel = document.getElementById("unlock-panel");
const unlockMessage = document.getElementById("unlock-message");

let reports = loadReports();
let isUnlocked = sessionStorage.getItem("ivy-leaf-unlocked") === "true";
const currentCategorySlug = getCategorySlugFromPath(window.location.pathname);

if (isUnlocked && uploadFormWrapper && unlockPanel) {
  showUploadForm();
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
      unlockMessage.textContent = "Upload unlocked. You can now add stories.";
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
    const file = formData.get("file");

    if (!isUnlocked) {
      alert("Please unlock the upload panel first.");
      return;
    }

    if (!title) {
      return;
    }

    if (!sourceUrl && !file) {
      alert("Add either a source link or upload a file.");
      return;
    }

    const fileData = file && file.size > 0 ? await readFileAsDataUrl(file) : null;
    const normalizedCategory = normalizeCategory(category);

    const report = {
      id: crypto.randomUUID(),
      title,
      category: normalizedCategory.label,
      categorySlug: normalizedCategory.slug,
      sourceUrl,
      notes,
      createdAt: new Date().toISOString(),
      fileName: file?.name || "",
      fileType: file?.type || "",
      fileData: fileData || "",
    };

    reports = [report, ...reports];
    saveReports();
    reportForm.reset();

    const targetPage = getCategoryPagePath(normalizedCategory.slug);
    window.location.assign(`${targetPage}?saved=1`);
  });
}

function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Could not load reports", error);
    return [];
  }
}

function saveReports() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
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

function renderReports() {
  if (!reportList) {
    return;
  }

  const filteredReports = currentCategorySlug === "all"
    ? reports
    : reports.filter((report) => report.categorySlug === currentCategorySlug);

  if (!filteredReports.length) {
    reportList.innerHTML = `
      <div class="empty-state">
        <p>No stories yet in ${getCategoryLabel(currentCategorySlug)}.</p>
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

      return `
        <article class="report-card">
          <span class="badge">${escapeHtml(report.category)}</span>
          <h3>${escapeHtml(report.title)}</h3>
          <p class="meta">Added ${new Date(report.createdAt).toLocaleDateString()}</p>
          ${report.notes ? `<p class="notes">${escapeHtml(report.notes)}</p>` : ""}
          ${sourceMarkup ? `<p>${sourceMarkup}</p>` : ""}
          ${previewMarkup}
          ${report.fileData ? `<a href="${escapeAttribute(report.fileData)}" download="${escapeAttribute(report.fileName || "report")}">Download file</a>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderPreview(report) {
  if (!report.fileData) {
    return "";
  }

  if (report.fileType.startsWith("image/")) {
    return `<div class="preview"><img src="${escapeAttribute(report.fileData)}" alt="${escapeHtml(report.title)}" /></div>`;
  }

  if (report.fileType === "application/pdf") {
    return `<div class="preview"><iframe src="${escapeAttribute(report.fileData)}"></iframe></div>`;
  }

  return `<div class="preview"><p class="notes">Uploaded file: ${escapeHtml(report.fileName || "report")}</p></div>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
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

function getCategoryPagePath(categorySlug) {
  if (categorySlug === "urban-design") return "urban-design.html";
  if (categorySlug === "architecture") return "architecture.html";
  if (categorySlug === "engineering") return "engineering.html";
  if (categorySlug === "innovations") return "innovations.html";
  if (categorySlug === "environmental-reports") return "environmental-reports.html";
  return "library.html";
}

renderReports();
