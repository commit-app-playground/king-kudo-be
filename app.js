/** @format */

require("dotenv").config();
const { App } = require("@slack/bolt");
const AWS = require("aws-sdk");

AWS.config.update({
  region: "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
  },
  endpoint: process.env.DYNAMODB_ENDPOINT,
});

const docClient = new AWS.DynamoDB.DocumentClient();

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

/* Add functionality here */
app.message("hello", async ({ message, say }) => {
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hey there <@${message.user}>!`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Click Me",
          },
          action_id: "button_click",
        },
      },
    ],
    text: `Hey there <@${message.user}>!`,
  });
});

app.command("/stats", async ({ payload, command, body, say, respond, ack }) => {
  await ack("tabulating...");
  const { user_id } = command;
  // fetch last aggregate
  const records = await docClient
    .query({
      TableName: "PointsAggregate",
      KeyConditionExpression: "#id = :user",
      ScanIndexForward: false,
      ExpressionAttributeNames: {
        "#id": "user_id",
      },
      ExpressionAttributeValues: {
        ":user": user_id,
      },
    })
    .promise()
    .then((data, err) => {
      if (err) {
        console.log("Points query err: " + JSON.stringify(err));
        return null;
      } else {
        console.log("Points query success: " + JSON.stringify(data));
        return data;
      }
    });
  const lastRecord = (records?.Items.length && records?.Items[0]) || {
    user_id: null,
    timestamp: "0",
    points: 0,
  };

  // fetch all events since last aggregate timestamp
  const events = await docClient
    .query({
      TableName: "Events",
      KeyConditionExpression: "#id = :user AND #timestamp > :ts",
      ScanIndexForward: false,
      ExpressionAttributeNames: {
        "#id": "user_id",
        "#timestamp": "timestamp",
      },
      ExpressionAttributeValues: {
        ":user": user_id,
        ":ts": lastRecord.timestamp,
      },
    })
    .promise()
    .then((data, err) => {
      if (err) {
        console.log("Events query err: " + JSON.stringify(err));
        return null;
      } else {
        console.log("Events query success: " + JSON.stringify(data));
        return data;
      }
    });

  // tally up + last_aggregate.points
  const sum = (lastRecord?.points || 0) + (events?.Count || 0);
  console.log(sum);
  // record new aggregate
  await docClient.put(
    {
      TableName: "PointsAggregate",
      Item: {
        user_id: user_id,
        timestamp: new Date().getTime().toString(),
        points: sum,
      },
    },
    (err, data) => {
      if (err) console.log("Points put err: " + JSON.stringify(err));
      else console.log("Points put success: " + JSON.stringify(data));
    }
  );

  // pass back new point
  say(`Points: ${sum || "TBD"}`);
});

app.event("reaction_added", async (res) => {
  // console.log("hi: " + JSON.stringify(res));

  await docClient.put(
    {
      TableName: "Events",
      Item: {
        user_id: res.payload.item_user,
        timestamp: res.payload.event_ts,
        reaction_type: res.event.reaction,
        reaction_owner_id: res.payload.user,
      },
    },
    (err, data) => {
      if (err) console.log("put err: " + JSON.stringify(err));
      else console.log("put success: " + JSON.stringify(data));
    }
  );
});

app.action("button_click", async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  await say(`<@${body.user.id}> clicked the button`);
});

(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
