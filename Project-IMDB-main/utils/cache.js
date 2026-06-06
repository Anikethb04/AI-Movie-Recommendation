const cacheStore = new Map();

exports.getCachedValue = (key) => {
  const entry = cacheStore.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
};

exports.setCachedValue = (key, value, ttlMs) => {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};
