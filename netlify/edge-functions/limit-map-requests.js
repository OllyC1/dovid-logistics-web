const continueRequest = () => undefined;

export default continueRequest;

export const config = {
  path: "/api/maps/*",
  rateLimit: {
    windowLimit: 40,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
