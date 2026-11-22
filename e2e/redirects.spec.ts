import { expect, test } from "@playwright/test";

// Old links from before the library and analytics pages. The destination may carry a leftover query value.
const REDIRECTS = [
  { from: "/artists", to: "/analytics?view=artists" },
  { from: "/artists?decade=1970", to: "/analytics?decade=1970&view=artists&scope=decade-1970" },
  { from: "/years", to: "/library?sort=year" },
  { from: "/years/1975", to: "/analytics?scope=year-1975" },
  { from: "/decades", to: "/analytics?view=decades" },
  { from: "/decades/1970", to: "/analytics?scope=decade-1970" },
];

test.describe("old links", () => {
  for (const { from, to } of REDIRECTS) {
    test(`${from} redirects to ${to}`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe(to);
    });
  }
});
