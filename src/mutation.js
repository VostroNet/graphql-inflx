

import {GraphQLBoolean, GraphQLList, GraphQLInputObjectType, GraphQLString, GraphQLInt} from "graphql";

import dateType from "@vostro/graphql-types/lib/date";
import jsonType from "@vostro/graphql-types/lib/json";
import floatType from "@vostro/graphql-types/lib/float";

import {Types} from "@vostro/inflx";

export function createMutation(model) {
  const input = new GraphQLInputObjectType({
    name: `Inflx${model.modelName}CreateInput`,
    fields: Object.assign({
      time: {
        type: dateType,
      }
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
    }, {}), model.schema.tags.reduce((o, t) => {
      o[t] = {
        type: GraphQLString,
      };
      return o;
    }, {})),
  });

  return {
    type: GraphQLBoolean,
    args: {
      input: {
        type: new GraphQLList(input),
      },
    },
    async resolve(source, args, context, info) {
      await model.createBulk(args.input, {context});
      return true;
    },
  };
}
