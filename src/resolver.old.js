
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLID,
} from "graphql";

import {toGlobalId} from "graphql-relay/lib/node/node";
import { toCursor, fromCursor } from "./cursor";
import { GQLPageInfo } from "./objects";
import InfluxQL from "influx-ql";

export function createField(name, fields) {
  const edge = new GraphQLObjectType({
    name: `${name}Edge`,
    fields: {
      cursor: {
        type: GraphQLString,
      },
      node: {
        type: new GraphQLObjectType({
          name: `${name}Node`,
          fields: Object.assign({
            id: {
              type: GraphQLID,
              resolve(source) {
                return toGlobalId(name, source.time.toISOString());
              },
            },
            time: {type: GraphQLString}
          }, fields),
        }),
      },
    },
  });
  return new GraphQLObjectType({
    name,
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


export function createResolver(influx, name, fields, args, countKey, rp, database) {
  return {
    args: createDefaultArgs(),
    type: createField(name, fields),
    async resolve(source, args, context, info) {
      try {
        const ql = new InfluxQL(database);
        ql.addMeasurement("usage");
        ql.RP = rp;
        ql.addGroup("*");
        ql.addFunction("count", countKey);
        const countQuery = ql.toSelect();
        ql.removeFunction("count", countKey);
        if (args.first || args.last) {
          ql.limit = parseInt(args.first || args.last, 10);
        }
        let cursor;
        if (args.after || args.before) {
          cursor = fromCursor(args.after || args.before);
          let startIndex = Number(cursor.index);
          if (startIndex >= 0) {
            ql.offset = startIndex + 1;
          }
        }
        const query = ql.toSelect();
        console.log("count-query", countQuery);
        console.log("query", query);
        const [countResult, results] = await Promise.all([
          influx.query(countQuery),
          influx.query(query),
        ]);
        const fullCount = countResult[0].count;

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
            cursor: toCursor(name, idx + startIndex),
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
        console.log("results", fullCount, results);
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
  }, args);
}
