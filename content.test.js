const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const annotationStoreScript = fs.readFileSync(path.join(__dirname, "annotation-store.js"), "utf8");
const textMatcherScript = fs.readFileSync(path.join(__dirname, "text-matcher.js"), "utf8");
const annotationRendererScript = fs.readFileSync(path.join(__dirname, "annotation-renderer.js"), "utf8");
const contentUIScript = fs.readFileSync(path.join(__dirname, "content-ui.js"), "utf8");
const contentScript = fs.readFileSync(path.join(__dirname, "content-new.js"), "utf8");

function createPage(body, initialStored = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: "outside-only",
    url: "https://example.test/article"
  });
  const stored = { ...initialStored };
  dom.window.chrome = {
    runtime: { id: "test-extension" },
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, ...stored };
        },
        async set(values) {
          Object.assign(stored, values);
        },
        async remove(key) {
          delete stored[key];
        }
      },
      onChanged: { addListener() {} }
    }
  };
  Object.defineProperty(dom.window.crypto, "randomUUID", { value: () => "test-marker" });
  dom.window.Range.prototype.getBoundingClientRect = () => ({ right: 10, bottom: 10 });
  dom.window.eval(annotationStoreScript);
  dom.window.eval(textMatcherScript);
  dom.window.eval(annotationRendererScript);
  dom.window.eval(contentUIScript);
  dom.window.eval(contentScript);
  return { dom, stored };
}

async function markText(dom, textNode, start, end) {
  const range = dom.window.document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = dom.window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  dom.window.document.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  dom.window.document.querySelector("#page-marker-notes-host").shadowRoot
    .querySelector('.swatch[data-color="yellow"]').click();
  await new Promise((resolve) => setImmediate(resolve));
}

test("marks selected text in regular page content", async () => {
  const { dom } = createPage("<p>ordinary text</p>");
  const textNode = dom.window.document.querySelector("p").firstChild;

  await markText(dom, textNode, 0, 8);

  assert.equal(dom.window.document.querySelector(".page-marker-highlight")?.textContent, "ordinary");
  dom.window.close();
});

test("does not mark text inside contenteditable regions", async () => {
  const { dom } = createPage('<div contenteditable="true">editable text</div>');
  const textNode = dom.window.document.querySelector("[contenteditable]").firstChild;

  await markText(dom, textNode, 0, 8);

  assert.equal(dom.window.document.querySelector(".page-marker-highlight"), null);
  dom.window.close();
});

test("restores a selection using context from adjacent text nodes", async () => {
  const body = "<p>Before <strong>SELECT</strong> after</p>";
  const { dom, stored } = createPage(body);
  const selectedText = dom.window.document.querySelector("strong").firstChild;

  await markText(dom, selectedText, 0, 6);
  const annotation = stored["page-marker:https://example.test/article"][0];
  assert.equal(annotation.prefix, "Before ");
  assert.equal(annotation.suffix, " after");
  dom.window.close();

  const restored = createPage(body, stored);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(restored.dom.window.document.querySelector(".page-marker-highlight")?.textContent, "SELECT");
  restored.dom.window.close();
});