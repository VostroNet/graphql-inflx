
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  // GraphQLInt,
  // GraphQLList,
} from "graphql";

export const GQLPageInfo = new GraphQLObjectType({
  name: "InfluxPageInfo",
  fields() {
    return {
      "hasNextPage": {
        type: GraphQLBoolean,
      },
      "hasPreviousPage": {
        type: GraphQLBoolean,
      },
      "startCursor": {
        type: GraphQLString,
      },
      "endCursor": {
        type: GraphQLString,
      },
    };
  },
});
