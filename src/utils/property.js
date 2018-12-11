const INFINITY = 1 / 0;
const toString = Object.prototype.toString;
const reIsDeepProp = /\.|\[(?:[^[\]]*|([""])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
const reIsPlainProp = /^\w*$/;
const charCodeOfDot = ".".charCodeAt(0);
const reEscapeChar = /\\(\\)?/g;
const rePropName = RegExp(`[^.[\\]]+|\\[(?:([^"'].*)|(["'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2)\\]|(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))`, "g");
const MAX_MEMOIZE_SIZE = 500;


function memoize(func, resolver) {
  if (typeof func !== "function" || (resolver !== null && typeof resolver !== "function")) {
    throw new TypeError("Expected a function");
  }
  const memoized = function(...args) {
    const key = resolver ? resolver.apply(this, args) : args[0];
    const cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || Map)();
  return memoized;
}
memoize.Cache = Map;

function memoizeCapped(func) {
  const result = memoize(func, (key) => {
    const { cache } = result;
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });

  return result;
}


const stringToPath = memoizeCapped((string) => {
  const result = [];
  if (string.charCodeAt(0) === charCodeOfDot) {
    result.push("");
  }
  string.replace(rePropName, (match, expression, quote, subString) => {
    let key = match;
    if (quote) {
      key = subString.replace(reEscapeChar, "$1");
    }
    else if (expression) {
      key = expression.trim();
    }
    result.push(key);
  });
  return result;
});

function baseGetTag(value) {
  if (value === null) {
    return value === undefined ? "[object Undefined]" : "[object Null]";
  }
  return toString.call(value);
}
function isSymbol(value) {
  const type = typeof value;
  return type === "symbol" || (type === "object" && value !== null && baseGetTag(value) === "[object Symbol]");
}

function toKey(value) {
  if (typeof value === "string" || isSymbol(value)) {
    return value;
  }
  const result = `${value}`;
  return (result === "0" && (1 / value) === -INFINITY) ? "-0" : result;
}
function baseProperty(key) {
  return (object) => object === null ? undefined : object[key];
}

function castPath(value, object) {
  if (Array.isArray(value)) {
    return value;
  }
  return isKey(value, object) ? [value] : stringToPath(value);
}

function baseGet(object, path) {
  path = castPath(path, object);

  let index = 0;
  const length = path.length;

  while (object !== null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index === length) ? object : undefined;
}

function basePropertyDeep(path) {
  return (object) => baseGet(object, path);
}

function isKey(value, object) {
  if (Array.isArray(value)) {
    return false;
  }
  const type = typeof value;
  if (type === "number" || type === "boolean" || value === null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object !== null && value in Object(object));
}
export default function property(path) {
  return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
}
