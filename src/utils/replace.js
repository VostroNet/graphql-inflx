import Op from "@vostro/inflx/lib/operators";
import {fromGlobalId} from "graphql-relay";

function getProperties(obj) {
  return [].concat(Object.keys(obj), Object.getOwnPropertySymbols(obj));
}


export function replaceKeyDeep(obj, keyMap = Op) {
  return Object.keys(obj).reduce((memo, key)=> {

    // determine which key we are going to use
    let targetKey = keyMap[key] ? keyMap[key] : key;

    if (Array.isArray(obj[key])) {
      // recurse if an array
      memo[targetKey] = obj[key].map((val) => {
        if (Object.prototype.toString.call(val) === "[object Object]") {
          return replaceKeyDeep(val, keyMap);
        }
        return val;
      });
    } else if (Object.prototype.toString.call(obj[key]) === "[object Object]") {
      // recurse if Object
      memo[targetKey] = replaceKeyDeep(obj[key], keyMap);
    } else {
      // assign the new value
      memo[targetKey] = obj[key];
    }

    // return the modified object
    return memo;
  }, {});
}


function checkObject(value, keyMap, variableValues, isTagged) {
  if (typeof value === "function") {
    const result = value(variableValues);
    return checkObject(result, keyMap, variableValues, isTagged);
  } else if (Array.isArray(value)) {
    return value.map((val) => {
      return checkObject(val, keyMap, variableValues, isTagged);
    });
  } else if (Object.prototype.toString.call(value) === "[object Object]") {
    return replaceIdDeep(value, keyMap, variableValues, isTagged);
  } else if (isTagged) {
    try {
      return fromGlobalId(value).id;
    } catch {
      return value;
    }
  } else {
    return value;
  }
}

export function replaceIdDeep(obj, keyMap, variableValues, isTagged = false) {
  return getProperties(obj).reduce((m, key) => {
    if (keyMap.indexOf(key) > -1 || isTagged) {
      m[key] = checkObject(obj[key], keyMap, variableValues, true);
    } else {
      m[key] = checkObject(obj[key], keyMap, variableValues, false);
    }
    return m;
  }, {});
}
