
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLID,
} from "graphql";

import {replaceKeyDeep} from "./replace-operators";

import {toGlobalId} from "graphql-relay/lib/node/node";
import { toCursor, fromCursor } from "./cursor";
import { GQLPageInfo } from "./objects";
import dateType from "./types/dateType";
import jsonType from "./types/jsonType";

export function createField(model) {
  const name = model.modelName;
  const edge = new GraphQLObjectType({
    name: `Inflx${name}Edge`,
    fields: {
      cursor: {
        type: GraphQLString,
      },
      node: {
        type: new GraphQLObjectType({
          name: `Inflx${name}Node`,
          fields: Object.assign({
            id: {
              type: GraphQLID,
              resolve(source) {
                return toGlobalId(name, source.time.toISOString());
              },
            },
            time: {
              type: dateType,
              resolve(source) {
                return source.time.toISOString();
              },
            },
          }, Object.keys(model.schema.fields).reduce((o, f) => {
            o[f] = {
              type: GraphQLString,
            };
            return o;
          }, {}),
          (model.schema.tags || []).reduce((o, t) => {
            o[t] = {
              type: GraphQLString,
            };
            return o;
          }, {})),
        }),
      },
    },
  });
  return new GraphQLObjectType({
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
  });
}


export function createResolver(model, hooks, defaultOptions) {
  return {
    args: createDefaultArgs(),
    type: createField(model),
    async resolve(source, args, context, info) {
      try {
        let opts = Object.assign({
          context,
          groups: [
            "*",
          ],
          raw: true,
        }, defaultOptions);
        if (args.first || args.last) {
          opts.limit = parseInt(args.first || args.last, 10);
        }
        let cursor;
        if (args.after || args.before) {
          cursor = fromCursor(args.after || args.before);
          let startIndex = Number(cursor.index);
          if (startIndex >= 0) {
            opts.offset = startIndex + 1;
          }
        }
        if (args.where) {
          opts.where = replaceKeyDeep(args.where);
        }


        const [fullCount, results] = await Promise.all([
          model.count(Object.assign({
            context,
            where: opts.where,
            groups: [
              "*",
            ]
          }, defaultOptions)),
          model.findAll(opts),
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
      } catch(er) {
        console.log("err", er);
      }
      return {};
    },
  };
}

export function createDefaultArgs(args) {
  return Object.assign({
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
    }
  }, args);
}
