const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

async function run() {
  const requests = [];
  const stored = [];
  let updates = 0;
  const context = {
    URL,
    URLSearchParams,
    clearInterval() {},
    clearTimeout() {},
    document: { cookie: "ct0=test-csrf" },
    setInterval: () => 1,
    setTimeout: callback => {
      callback();
      return 1;
    },
    fetch: async url => {
      requests.push(String(url));
      if (String(url).includes("AboutAccountQuery")) {
        const variables = JSON.parse(new URL("https://x.com" + url).searchParams.get("variables"));
        const basedIn = variables.screenName === "regional" ? "South Asia" : "India";
        return response({
          data: {
            user_result_by_screen_name: {
              result: { about_profile: { account_based_in: basedIn } }
            }
          }
        });
      }
      if (String(url).includes("users/lookup.json")) {
        return response([{ screen_name: "regional", location: "Bengaluru, India" }]);
      }
      throw new Error("Unexpected request: " + url);
    },
    chrome: {
      storage: {
        local: {
          get: (_key, callback) => callback({}),
          set: value => stored.push(value)
        }
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["countries.js", "detection.js", "account-location.js"]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  const lookup = context.XCF_ACCOUNT_LOCATION.create({
    shouldLookup: () => true,
    onUpdate: () => { updates += 1; }
  });
  lookup.start();

  lookup.enqueue("xlkharr");
  await lookup.pump();
  assert.equal(lookup.get("XLKHARR").cc, "IN");
  assert.equal(lookup.get("xlkharr").source, "account");
  assert.equal(lookup.get("xlkharr").basedIn, "India");
  assert.equal(requests.length, 1, "an exact account country must not need profile fallback");

  lookup.enqueue("regional");
  await lookup.pump();
  assert.equal(lookup.get("regional").cc, "IN");
  assert.equal(lookup.get("regional").source, "profile");
  assert.equal(lookup.get("regional").basedIn, "South Asia");
  assert.ok(requests.some(url => url.includes("users/lookup.json")));
  assert.ok(stored.some(value => value.xcfLocCache.version === 3));
  assert.ok(updates >= 3, "cache loads and completed lookups must trigger rescans");

  console.log("Account-location tests passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
