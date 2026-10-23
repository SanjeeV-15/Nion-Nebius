// Checks when Nion treats the sound output as earphones (so it may stop talking the moment you
// start): only when the name clearly says so. Anything unclear counts as speakers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeEarphones, watchEarphones } from "../public/js/earphones.js";

test("clear earphone and headset names count; speakers and unclear names do not", () => {
  for (const label of ["Default - AirPods Pro", "Default - External Headphones", "Headset Earphone (Realtek)", "Galaxy Buds2 Pro", "Default - Sony WH-1000XM5 Headset"]) {
    assert.equal(looksLikeEarphones(label), true, label);
  }
  for (const label of ["Default - MacBook Pro Speakers", "Default - JBL Flip 6", "Bluetooth Speaker", "Default - Studio Display Speakers", "", undefined, null]) {
    assert.equal(looksLikeEarphones(label), false, `${label}`);
  }
});

test("watching reads the default output now, and again when devices change", async () => {
  let devices = [{ kind: "audiooutput", deviceId: "default", label: "Default - MacBook Pro Speakers" }];
  let onDeviceChange;
  const mediaDevices = {
    enumerateDevices: async () => devices,
    addEventListener: (type, handler) => {
      if (type === "devicechange") onDeviceChange = handler;
    },
  };
  const seen = [];
  const watch = watchEarphones((result) => seen.push(result.on), mediaDevices);
  await watch.check();
  devices = [{ kind: "audiooutput", deviceId: "default", label: "Default - AirPods Pro" }];
  await onDeviceChange();
  assert.deepEqual(seen, [false, true]);
});

test("if the browser cannot say, it is treated as speakers", async () => {
  const seen = [];
  await watchEarphones((result) => seen.push(result.on), undefined).check();
  await watchEarphones((result) => seen.push(result.on), { enumerateDevices: async () => { throw new Error("no"); } }).check();
  assert.deepEqual(seen, [false, false]);
});
