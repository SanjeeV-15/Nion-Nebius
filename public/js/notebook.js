// The Notebook screen: everything Nion keeps for you, in one place. You can read it,
// tick off list items, delete things, copy an email draft, export everything, or
// delete it all. It is read from, and saved to, this device's own browser storage.
//
// Everything Nion or you wrote is put on the page as plain text, never as HTML.

import { applyChanges, clearData, loadData } from "./data.js";
import { describeDay, expenseDays, LIST_NAMES, LISTS, localToday } from "../../shared/store.js";
import { describeWhen } from "../../shared/time.js";
import { draftAsText, listAsText, mailtoLink, recapAsText } from "../../shared/export.js";
import { shareText } from "./share.js";

const root = document.getElementById("notebook");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const node = el("button", "mini", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

// Makes a change, saves it, and redraws the page.
function change(ops) {
  applyChanges(ops);
  render();
}

// A small button that shares some text and shows what happened for a moment.
function shareButton(label, getContent) {
  const node = button(label, async () => {
    const outcome = await shareText(getContent());
    if (outcome === "cancelled") return;
    node.textContent = { shared: "Shared", copied: "Copied", failed: "Couldn't share" }[outcome];
    setTimeout(() => (node.textContent = label), 2000);
  });
  return node;
}

function section(title, emptyText, items, extra) {
  const box = el("section", "nb-section");
  const head = el("div", "nb-head-row");
  head.append(el("h2", "", title));
  if (extra) head.append(extra);
  box.append(head);
  if (items.length === 0) box.append(el("p", "nb-empty", emptyText));
  else box.append(...items);
  return box;
}

function row(text, ...controls) {
  const node = el("div", "nb-row");
  node.append(el("span", "nb-text", text), ...controls);
  return node;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function memoriesSection(data) {
  return section(
    "What Nion remembers",
    "Nothing yet. Tell Nion something lasting, like \"I don't eat pork\".",
    data.memories.map((m) => row(m.text, button("Forget", () => change([{ op: "forget", id: m.id }]))))
  );
}

function listSection(data, name) {
  const items = data.lists[name].map((item) => {
    const box = el("input");
    box.type = "checkbox";
    box.checked = item.done;
    box.setAttribute("aria-label", `Done: ${item.text}`);
    box.addEventListener("change", () => change([{ op: box.checked ? "complete_item" : "reopen_item", list: name, id: item.id }]));
    const node = row(item.text, button("Remove", () => change([{ op: "remove_item", list: name, id: item.id }])));
    node.prepend(box);
    if (item.done) node.classList.add("done");
    return node;
  });
  const title = name === "todo" ? "To-do list" : "To-visit list";
  const hasOpen = data.lists[name].some((item) => !item.done);
  const share = hasOpen ? shareButton("Share", () => ({ title: `My ${LIST_NAMES[name]}`, text: listAsText(data, name) })) : undefined;
  return section(title, `Nothing on the ${LIST_NAMES[name]} yet.`, items, share);
}

function remindersSection(data) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const items = data.reminders
    .filter((r) => !r.done)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .map((r) => row(`${r.text} · ${describeWhen(Date.parse(r.dueAt), Date.now(), zone)}`, button("Cancel", () => change([{ op: "remove_reminder", id: r.id }]))));
  return section("Reminders (Nion says them aloud while it is open)", "No reminders. Ask Nion to remind you of something.", items);
}

function expensesSection(data) {
  const items = [];
  for (const day of expenseDays(data)) {
    items.push(el("p", "nb-day", `${day || "Unknown day"}: ${describeDay(data, day)}`));
    for (const e of data.expenses.filter((x) => x.day === day).reverse()) {
      const label = `${e.amount.toFixed(2)}${e.currency ? ` ${e.currency}` : ""} · ${e.category || "other"}${e.note ? ` · ${e.note}` : ""}`;
      items.push(row(label, button("Remove", () => change([{ op: "remove_expense", id: e.id }]))));
    }
  }
  return section("Expenses", "No expenses yet. Tell Nion what you spent.", items);
}

function draftsSection(data) {
  const drafts = [...data.drafts].reverse().map((d) => {
    const node = el("div", "nb-draft");
    const copy = button("Copy", async () => {
      const ok = await copyText(draftAsText(d));
      copy.textContent = ok ? "Copied" : "Couldn't copy";
      setTimeout(() => (copy.textContent = "Copy"), 2000);
    });
    // Opens the person's own email app with this draft filled in. They press send.
    const emailLink = mailtoLink(d);
    const email = emailLink ? el("a", "mini", "Open in email app") : undefined;
    if (email) email.href = emailLink;
    node.append(
      el("p", "nb-head", `To: ${d.to || "(nobody yet)"}`),
      el("p", "nb-head", `Subject: ${d.subject || "(none)"}`),
      el("p", "nb-body", d.body)
    );
    const buttons = el("div", "nb-buttons");
    buttons.append(
      ...(email ? [email] : []),
      shareButton("Share", () => ({ title: d.subject || "Email draft", text: draftAsText(d) })),
      copy,
      button("Delete", () => change([{ op: "remove_draft", id: d.id }]))
    );
    node.append(buttons);
    return node;
  });
  return section("Email drafts (saved, never sent)", "No drafts yet.", drafts);
}

function exportNotebook() {
  try {
    const file = new Blob([JSON.stringify(loadData(), null, 2)], { type: "application/json" });
    const link = el("a");
    link.href = URL.createObjectURL(file);
    link.download = "nion-notebook.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch {
    // Nothing to do: the browser blocked the download.
  }
}

function render() {
  const data = loadData();
  root.replaceChildren(
    memoriesSection(data),
    ...LISTS.map((name) => listSection(data, name)),
    remindersSection(data),
    expensesSection(data),
    draftsSection(data)
  );

  const actions = el("div", "nb-actions");
  const recap = shareButton("Share today's recap", () => ({ title: "Trip recap", text: recapAsText(data, localToday()) }));
  recap.className = "pill small";
  const exportButton = el("button", "pill small", "Export");
  exportButton.type = "button";
  exportButton.addEventListener("click", exportNotebook);
  const wipe = el("button", "pill small", "Delete everything");
  wipe.type = "button";
  wipe.addEventListener("click", () => {
    if (confirm("Delete everything in the notebook? This can't be undone.")) {
      clearData();
      render();
    }
  });
  actions.append(recap, exportButton, wipe);
  root.append(actions);
}

render();
