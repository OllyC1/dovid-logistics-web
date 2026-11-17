const continueRequest = () => undefined;

export default continueRequest;

export const config = {
  path: "/api/delivery/quotes",
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
