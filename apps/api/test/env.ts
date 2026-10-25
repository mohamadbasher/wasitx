// Runs before any test module is imported: point the API at the isolated test database.
process.env.NODE_ENV = "test";
process.env.JOBS_ENABLED = "false";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://wasitx:wasitx_dev_only@127.0.0.1:5544/wasitx_test";
process.env.TOKEN_SIGNING_KEY ??= "test-only-token-signing-key-000000000000000";
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.LOOKUP_HMAC_KEY ??= "test-only-lookup-hmac-key-0000000000000000";
process.env.STORAGE_LOCAL_DIR = ".storage-test";
