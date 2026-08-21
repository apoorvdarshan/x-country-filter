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
        const basedIn = variables.screenName === "regional"
          ? "South Asia"
          : variables.screenName === "profileonly" ? "" : "India";
        return response({
          data: {
            user_result_by_screen_name: {
              result: { about_profile: { account_based_in: basedIn } }
            }
          }
        });
      }
      if (String(url).includes("users/lookup.json")) {
        const handle = new URL("https://x.com" + url).searchParams.get("screen_name");
        if (handle === "graphqlfollow") return response({}, 404);
        return response([{
          screen_name: handle,
          location: handle === "profileonly" ? "Bengaluru, India" : "",
          following: handle === "xlkharr"
        }]);
      }
      if (String(url).includes("UserByScreenName")) {
        return response({
          data: {
            user: {
              result: {
                legacy: { location: "" },
                relationship_perspectives: { following: true }
              }
            }
          }
        });
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
  for (const file of ["country-catalog.js", "countries.js", "detection.js", "account-location.js"]) {
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
  assert.equal(lookup.get("xlkharr").accountCountry, "IN");
  assert.equal(lookup.get("xlkharr").accountRegion, "SOUTH_ASIA");
  assert.equal(lookup.get("xlkharr").following, true);
  assert.equal(requests.length, 2, "country and following relationship require one request each");

  lookup.enqueue("regional");
  await lookup.pump();
  assert.equal(lookup.get("regional").cc, null);
  assert.equal(lookup.get("regional").source, "region");
  assert.equal(lookup.get("regional").basedIn, "South Asia");
  assert.equal(lookup.get("regional").accountCountry, null);
  assert.equal(lookup.get("regional").accountRegion, "SOUTH_ASIA");
  assert.equal(lookup.get("regional").profileCountry, null);
  assert.equal(lookup.get("regional").following, false);

  lookup.enqueue("profileonly");
  await lookup.pump();
  assert.equal(lookup.get("profileonly").cc, "IN");
  assert.equal(lookup.get("profileonly").source, "profile");
  assert.equal(lookup.get("profileonly").profileCountry, "IN");
  assert.equal(lookup.get("profileonly").following, false);

  lookup.enqueue("graphqlfollow");
  await lookup.pump();
  assert.equal(lookup.get("graphqlfollow").following, true);
  assert.ok(requests.some(url => url.includes("UserByScreenName")));

  assert.ok(requests.some(url => url.includes("users/lookup.json")));
  assert.ok(stored.some(value => value.xcfLocCache.version === 5));
  assert.ok(updates >= 4, "cache loads and completed lookups must trigger rescans");

  console.log("Account-location tests passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
