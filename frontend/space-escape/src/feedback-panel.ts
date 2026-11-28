interface EchoEntry {
  author: string;
  text: string;
  time: number | string;
  img?: string;
}

const DEFAULT_ECHOES: EchoEntry[] = [
  { author: "探索员·零", text: "低重力滑板手感太棒了！双击空格 Ollie 翻板很有节奏感。", time: "2026-09-30" },
  { author: "开普勒先锋", text: "希望能有更多的能量晶体滑翔路线和隐藏遗迹。", time: "2026-09-29" },
  { author: "回声通信站", text: "已收到多份星际航行反馈，游隼号推进器维护正常。", time: "2026-09-28" },
];

const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function isSafeImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && SAFE_DATA_IMAGE_RE.test(value);
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

export interface FeedbackPanelDeps {
  canvas: HTMLCanvasElement;
  getAuthor: () => string;
  isFeedbackOpen: () => boolean;
  openFeedback: () => void;
  closeFeedback: () => void;
  notice: (message: string) => void;
}

/**
 * Wires the public feedback & community echoes modal with safe DOM rendering
 * (zero `innerHTML`, strict `data:image/` validation).
 */
export function setupFeedbackPanel(deps: FeedbackPanelDeps): { renderEchoes: () => void } {
  let attachedFeedbackImg = "";

  const setPreview = (dataUrl: string) => {
    attachedFeedbackImg = dataUrl;
    const previewImg = byId<HTMLImageElement>("feedbackPreviewImg");
    const previewBox = byId("feedbackPreviewContainer");
    if (previewImg) {
      if (dataUrl) previewImg.src = dataUrl;
      else previewImg.removeAttribute("src");
    }
    if (previewBox) previewBox.hidden = !dataUrl;
  };

  const renderEchoes = () => {
    const container = byId("echoesList");
    if (!container) return;
    let saved: EchoEntry[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("kepler_echoes") || "[]");
      if (Array.isArray(parsed)) {
        saved = parsed.filter((e): e is EchoEntry => !!e && typeof e === "object");
      }
    } catch {
      saved = [];
    }
    const all: EchoEntry[] = [...saved, ...DEFAULT_ECHOES];
    container.replaceChildren(
      ...all.map((entry) => {
        const card = document.createElement("div");
        card.className = "echo-card";

        const meta = document.createElement("div");
        meta.className = "echo-meta";
        const author = document.createElement("b");
        author.textContent = String(entry.author || "探索员");
        const stamp = document.createElement("span");
        stamp.textContent =
          typeof entry.time === "number"
            ? new Date(entry.time).toLocaleDateString()
            : String(entry.time || "");
        meta.append(author, stamp);

        const content = document.createElement("div");
        content.className = "echo-content";
        content.textContent = String(entry.text || "");

        card.append(meta, content);
        if (isSafeImageDataUrl(entry.img)) {
          const img = document.createElement("img");
          img.src = entry.img;
          img.alt = "反馈附图";
          img.style.maxWidth = "140px";
          img.style.marginTop = "6px";
          img.style.borderRadius = "3px";
          img.style.border = "1px solid var(--border)";
          card.appendChild(img);
        }
        return card;
      }),
    );
  };

  const copyEmail = byId("copyEmail");
  if (copyEmail) {
    copyEmail.onclick = () => {
      navigator.clipboard
        .writeText("oodaleek@gmail.com")
        .then(() => deps.notice("已复制官方邮箱: oodaleek@gmail.com"))
        .catch(() => deps.notice("官方邮箱: oodaleek@gmail.com"));
    };
  }

  const snapBtn = byId("feedbackSnap");
  if (snapBtn) {
    snapBtn.onclick = () => {
      try {
        const captured = deps.canvas.toDataURL("image/jpeg", 0.85);
        if (!isSafeImageDataUrl(captured)) {
          deps.notice("截取画面失败");
          return;
        }
        setPreview(captured);
        deps.notice("已截取当前游戏画面作为建议附件");
      } catch {
        deps.notice("截取画面失败");
      }
    };
  }

  const fileInput = byId<HTMLInputElement>("feedbackFile");
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = String(ev.target?.result || "");
        if (isSafeImageDataUrl(result)) {
          setPreview(result);
        } else {
          deps.notice("仅支持常见图片格式附件");
        }
      };
      reader.readAsDataURL(file);
    };
  }

  const removeBtn = byId("removeFeedbackImg");
  if (removeBtn) {
    removeBtn.onclick = () => {
      setPreview("");
      if (fileInput) fileInput.value = "";
    };
  }

  const submitBtn = byId("submitFeedback");
  if (submitBtn) {
    submitBtn.onclick = () => {
      const textarea = byId<HTMLTextAreaElement>("feedbackContent");
      const content = (textarea?.value || "").trim();
      if (!content) {
        deps.notice("请输入您的建议或反馈");
        return;
      }
      const entry: EchoEntry = {
        author: deps.getAuthor(),
        text: content,
        img: isSafeImageDataUrl(attachedFeedbackImg) ? attachedFeedbackImg : undefined,
        time: Date.now(),
      };
      try {
        const parsed = JSON.parse(localStorage.getItem("kepler_echoes") || "[]");
        const existing: EchoEntry[] = Array.isArray(parsed) ? parsed : [];
        existing.unshift(entry);
        localStorage.setItem("kepler_echoes", JSON.stringify(existing.slice(0, 30)));
      } catch {}
      if (textarea) textarea.value = "";
      setPreview("");
      if (fileInput) fileInput.value = "";
      renderEchoes();
      deps.notice("建议已发射至开普勒基站，感谢探索员！");
    };
  }

  const feedbackBtn = byId("feedbackBtn");
  if (feedbackBtn) {
    feedbackBtn.onclick = () => {
      if (deps.isFeedbackOpen()) {
        deps.closeFeedback();
      } else {
        renderEchoes();
        deps.openFeedback();
      }
    };
  }

  const closeBtn = byId("closeFeedback");
  if (closeBtn) {
    closeBtn.onclick = () => deps.closeFeedback();
  }

  return { renderEchoes };
}
