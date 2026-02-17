const { Expo } = require("expo-server-sdk");

const expo = new Expo();

async function sendPushNotification(pushToken, title, body) {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.log("Invalid Expo push token:", pushToken);
    return;
  }

  const message = {
    to: pushToken,
    sound: "default",
    title: title,
    body: body,
  };

  try {
    await expo.sendPushNotificationsAsync([message]);
    console.log("Notification sent!");
  } catch (error) {
    console.error("Push error:", error);
  }
}

module.exports = { sendPushNotification };
