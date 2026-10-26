// k6 load test (https://k6.io): read-heavy marketplace traffic + authenticated quote/take/cancel loop.
//   k6 run -e API=http://localhost:4000/api/v1 -e EMAIL=rania@demo.local -e PASSWORD=... infra/load/market-and-trade.k6.js
// Run only against sandbox/staging. Budgets match docs/SCALING.md (p95 reads < 300 ms, error rate < 1%).
import http from "k6/http";
import { check, sleep } from "k6";

const API = __ENV.API ?? "http://localhost:4000/api/v1";

export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: 200 }, { duration: "3m", target: 200 }, { duration: "30s", target: 0 }], exec: "browse" },
    trade: { executor: "constant-vus", vus: 10, duration: "4m", exec: "trade", startTime: "30s" },
  },
  thresholds: {
    "http_req_duration{kind:read}": ["p(95)<300"],
    "http_req_duration{kind:write}": ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

export function browse() {
  const side = Math.random() < 0.7 ? "SELL" : "BUY";
  const r = http.get(`${API}/offers?side=${side}&sort=price&limit=20`, { tags: { kind: "read" } });
  check(r, { "offers 200": (x) => x.status === 200 });
  http.get(`${API}/market/stats`, { tags: { kind: "read" } });
  sleep(1 + Math.random() * 2);
}

export function setup() {
  if (!__ENV.EMAIL) return { token: null };
  const r = http.post(`${API}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), { headers: { "content-type": "application/json", "x-client": "mobile" } });
  return { token: r.json("accessToken") };
}

export function trade(data) {
  if (!data.token) return sleep(5);
  const h = { headers: { authorization: `Bearer ${data.token}`, "content-type": "application/json", "x-client": "mobile" } };
  const list = http.get(`${API}/offers?side=SELL&limit=10`, { ...h, tags: { kind: "read" } }).json("items") ?? [];
  const offer = list.find((o) => !o.isMine);
  if (!offer) return sleep(2);
  const key = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const take = http.post(`${API}/trades`, JSON.stringify({ offerId: offer.id, amountUsdt: "60", quotedPriceIls: offer.priceIls, quotedVersion: offer.version, acceptFees: true }), { headers: { ...h.headers, "idempotency-key": key }, tags: { kind: "write" } });
  check(take, { "take 201/409": (x) => x.status === 201 || x.status === 409 || x.status === 422 });
  if (take.status === 201) {
    http.post(`${API}/trades/${take.json("id")}/cancel`, JSON.stringify({ reason: "load test" }), { headers: { ...h.headers, "idempotency-key": `${key}-c` }, tags: { kind: "write" } });
  }
  sleep(1);
}
