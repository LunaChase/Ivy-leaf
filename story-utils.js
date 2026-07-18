export function normalizeCategory(rawCategory) {
  const text = String(rawCategory || "").trim().toLowerCase();

  if (/(urban|city|neighborhood|neighbourhood|planning|public|transport)/.test(text)) {
    return { slug: "urban-design", label: "Urban design" };
  }

  if (/(architect|building|facade|housing|structure|design)/.test(text)) {
    return { slug: "architecture", label: "Architecture" };
  }

  if (/(engineer|engineering|system|infrastructure|civil|mechanical|electrical|structural)/.test(text)) {
    return { slug: "engineering", label: "Engineering" };
  }

  if (/(innov|tech|technology|smart|future|digital|new)/.test(text)) {
    return { slug: "innovations", label: "Innovations" };
  }

  if (/(environment|climate|sustain|report|ecolog|energy|water|nature)/.test(text)) {
    return { slug: "environmental-reports", label: "Environmental reports" };
  }

  return { slug: "all", label: "All stories" };
}

export function getCategorySlugFromPath(pathname = window.location.pathname) {
  const path = pathname.split("/").pop() || "";
  if (path.startsWith("urban-design")) return "urban-design";
  if (path.startsWith("architecture")) return "architecture";
  if (path.startsWith("engineering")) return "engineering";
  if (path.startsWith("innovations")) return "innovations";
  if (path.startsWith("environmental-reports")) return "environmental-reports";
  if (path.startsWith("library")) return "all";
  return "all";
}

export function getCategoryLabel(slug) {
  const map = {
    "urban-design": "Urban design",
    architecture: "Architecture",
    engineering: "Engineering",
    innovations: "Innovations",
    "environmental-reports": "Environmental reports",
    all: "All stories",
  };

  return map[slug] || "All stories";
}
