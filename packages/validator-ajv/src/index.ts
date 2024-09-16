/**
 * Draft 2020-12 AJV adapter。这是唯一允许引入 AJV 的产品包。
 *
 * @module @xunserver-jsf/validator-ajv
 */
export { AJV_VALIDATOR_KEY, createAjvValidator } from "./create-ajv-validator.js";
export { normalizeAjvErrors } from "./ajv-error-normalizer.js";
