export default () => undefined;

export const config = {
  path: "/api/maps/*",
  rateLimit: {
    windowLimit: 40,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
