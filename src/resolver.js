
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLID,
  GraphQLEnumType,
} from "graphql";
import {replaceIdDeep, replaceKeyDeep} from "./utils/replace";

import {toGlobalId} from "graphql-relay/lib/node/node";
import { toCursor, fromCursor } from "./cursor";
import GQLPageInfo from "./page-info";

import dateType from "@vostro/graphql-types/lib/date";
import jsonType from "@vostro/graphql-types/lib/json";
import floatType from "@vostro/graphql-types/lib/float";
import {Types} from "@vostro/inflx";

export function createEdgeNodeType(model, options, customNode, customEdgeName) {
  const name = model.modelName;
  const node = customNode || new GraphQLObjectType({
    name: `Inflx${name}Node`,
    fields() {
      return Object.assign({
        id: {
          type: GraphQLID,
          resolve(source, args, context, info) {
            let id = `${source.time.toISOString()}`;
            if (args.groupBy) {
              id += args.groupBy;
            }
            id = (model.schema.tags || []).reduce((o, t) => {
              if (source[t]) {
                o += source[t];
              }
              return o;
            }, id);
            return toGlobalId(name, id);
          },
        },
        time: {
          type: dateType,
          resolve(source) {
            return source.time.toISOString();
          },
        },
      }, Object.keys(model.schema.fields).reduce((o, f) => {
        let type;
        switch (model.schema.fields[f]) {
          case Types.STRING:
            type = GraphQLString;
            break;
          case Types.FLOAT:
            type = floatType;
            break;
          case Types.INTEGER:
            type = GraphQLInt;
            break;
          case Types.BOOLEAN:
            type = GraphQLBoolean;
            break;
        }
        o[f] = {
          type,
        };
        return o;
      }, {}),
      (model.schema.tags || []).reduce((o, t) => {
        o[t] = {
          type: GraphQLString,
        };
        return o;
      }, {}), isFunction(options.fields) ? options.fields() : options.fields);
    },
  });
  const edge = new GraphQLObjectType({
    name: customEdgeName || `Inflx${name}Edge`,
    fields: {
      cursor: {
        type: GraphQLString,
      },
      node: {
        type: node,
      },
    },
  });
  return {
    node,
    edge: new GraphQLObjectType({
      name: `Inflx${name}`,
      fields: {
        pageInfo: {
          type: GQLPageInfo,
        },
        total: {
          type: GraphQLInt,
        },
        edges: {
          type: new GraphQLList(edge),
        },
      },
    }),
  };
}


export function createResolver(model, options, defaultFindOptions, customEdge, customNode, customEdgeName) {
  let edge;
  let modelGQL = model.gql || {};
  if (!modelGQL.edge && !customEdge && !customNode) {
    modelGQL = createEdgeNodeType(model, options);
    edge = modelGQL.edge;
  } else if (!modelGQL.edge && !customEdge && customNode) {
    if (!customEdgeName && customEdgeName !== "") {
      throw new Error("Unable to create custom node resolver without a custom edge name");
    }
    if (modelGQL[`_${customEdgeName}`]) {
      edge = modelGQL[`_${customEdgeName}`];
    } else {
      modelGQL = createEdgeNodeType(model, options, customNode, customEdgeName);
      edge = modelGQL.edge;
      model.gql = modelGQL;
    }
  } else if (customEdge) {
    edge = customEdge;
  } else if (modelGQL.edge) {
    edge = model.gql.edge;
  }
  if (!edge) {
    throw new Error("Unable to create resolver without an edge specified");
  }


  return {
    args: createDefaultArgs(options, model),
    type: edge,
    async resolve(source, args, context, info) {
      const groups = args.groupBy.length === 0 ? ["*"] : args.groupBy;
      const initOpts = {
        context,
        groups,
        raw: true,
      };
      let findOptions = Object.assign({gql: {source, args, context, info}}, initOpts, isFunction(defaultFindOptions) ?
        defaultFindOptions(initOpts, {source, args, context, info}) : defaultFindOptions);

      if (args.first || args.last) {
        findOptions.limit = parseInt(args.first || args.last, 10);
      }
      let cursor;
      if (args.after || args.before) {
        cursor = fromCursor(args.after || args.before);
        let startIndex = Number(cursor.index);
        if (startIndex >= 0) {
          findOptions.offset = startIndex + 1;
        }
      }
      if (args.where) {
        findOptions.where = replaceKeyDeep(args.where);
        if (model.schema.globalKeys) {
          findOptions.where = replaceIdDeep(findOptions.where, model.schema.globalKeys, info.variableValues);
        }
      }


      const [fullCount, results] = await Promise.all([
        model.count(Object.assign({
          context,
          where: findOptions.where,
          groups, //: groups
        }, findOptions)),
        model.findAll(findOptions),
      ]);

      const edges = results.map((row, idx) => {
        let startIndex = null;
        if (cursor) {
          startIndex = Number(cursor.index);
        }
        if (startIndex !== null) {
          startIndex++;
        } else {
          startIndex = 0;
        }
        return {
          cursor: toCursor(model.name, idx + startIndex),
          node: row,
        };
      });

      let firstEdge = edges[0];
      let lastEdge = edges[edges.length - 1];

      let hasNextPage = false;
      let hasPreviousPage = false;
      if (args.first || args.last) {
        const count = parseInt(args.first || args.last, 10);
        let index = cursor ? Number(cursor.index) : null;
        if (index !== null) {
          index++;
        } else {
          index = 0;
        }
        hasNextPage = index + 1 + count <= fullCount;
        hasPreviousPage = index - count >= 0;
        if (args.last) {
          [hasNextPage, hasPreviousPage] = [hasPreviousPage, hasNextPage];
        }
      }
      return {
        pageInfo: {
          startCursor: firstEdge ? firstEdge.cursor : null,
          endCursor: lastEdge ? lastEdge.cursor : null,
          hasNextPage: hasNextPage,
          hasPreviousPage: hasPreviousPage,
        },
        total: fullCount,
        edges,
      };
    },
  };
}
//todo AddFunction [] enums
//todo AddGroup [] enums
export function createDefaultArgs(options, model) {
  let args = Object.assign({
    after: {
      type: GraphQLString,
    },
    first: {
      type: GraphQLInt,
    },
    before: {
      type: GraphQLString,
    },
    last: {
      type: GraphQLInt,
    },
    where: {
      type: jsonType,
    },
    groupBy: {
      type: new GraphQLList(new GraphQLEnumType({
        name: `Inflx${model.modelName}GroupByEnum`,
        values: Object.assign({
          "wildcard": {value: "*"},
        }, (model.schema.tags || []).reduce((o, t) => {
          o[t] = {
            value: t,
          };
          return o;
        }, {}), options.groupBy),
      })),
    },
  }, options.args);
  return args;
}


function isFunction(functionToCheck) {
  return functionToCheck && {}.toString.call(functionToCheck) === "[object Function]";
}
