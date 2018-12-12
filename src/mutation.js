

import {GraphQLBoolean, GraphQLList, GraphQLInputObjectType, GraphQLString} from "graphql";
import dateType from "./types/dateType";

export function createMutation(model) {
  const input = new GraphQLInputObjectType({
    name: `Inflx${model.modelName}CreateInput`,
    fields: Object.assign({
      time: {
        type: dateType,
      }
    }, Object.keys(model.schema.fields).reduce((o, k) => {
      o[k] = {
        type: GraphQLString,
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
