const form = document.querySelector("#submission-form");
const demo = document.querySelector("#demo-url");
const content = document.querySelector("#post-content");
const status = document.querySelector("#status");
const open = document.querySelector("#open-dev");
const copy = document.querySelector("#copy-post");

function preparedPost() {
  const url = new URL(demo.value.trim());
  if (url.protocol !== "https:" || url.username || url.password || /(?:^|[&#])room=/u.test(url.hash)) {
    throw new Error("Use the public HTTPS link to your demo recording.");
  }
  return content.value.replaceAll("{{LIVE_DEMO_URL}}", url.href);
}

try {
  demo.value = `${location.origin}/demo/cadence-product-overview.mp4`;
  const response = await fetch("./post.md");
  if (!response.ok) throw new Error("The prepared post could not be loaded. Reload this page.");
  content.value = (await response.text()).replaceAll("{{STUDIO_ORIGIN}}", location.origin);
  open.disabled = false;
  copy.disabled = false;
} catch (error) {
  status.textContent = error.message;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  try {
    const editor = new URL("https://dev.to/new");
    editor.searchParams.set("prefill", preparedPost());
    window.open(editor.href, "_blank", "noopener,noreferrer");
    status.textContent = "Your prepared post is opening in DEV. Review it and press Publish there.";
  } catch (error) {
    status.textContent = error.message;
  }
});

copy.addEventListener("click", async () => {
  if (!form.reportValidity()) return;
  try {
    await navigator.clipboard.writeText(preparedPost());
    status.textContent = "Post copied. Paste it into the DEV submission template and publish.";
  } catch (error) {
    status.textContent = error.message;
  }
});
