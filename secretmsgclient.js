const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let registeredUsername = "";
let username = "";
let targetUsername = "";
const users = new Map();

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey: publicKey.export({ type: "pkcs1", format: "pem" }),
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!secret (\w+)$/))) {
          targetUsername = match[1];
          console.log(`Now secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          try {
            if (targetUsername) {
              const targetPublicKey = users.get(targetUsername);
              if (targetPublicKey) {
                const encryptedMessage = crypto.publicEncrypt(
                  targetPublicKey,
                  Buffer.from(message)
                );
                socket.emit("message", {
                  username,
                  message: encryptedMessage.toString("base64"),
                });
              } else {
                console.log("Target user's public key not found!");
              }
            } else {
              socket.emit("message", { username, message });
            }
          } catch (error) {
            console.error("Error encrypting the message:", error.message);
          }
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    try {
      const decryptedMessage = crypto.privateDecrypt(
        privateKey,
        Buffer.from(senderMessage, "base64")
      );
      console.log(`${senderUsername}: ${decryptedMessage.toString()}`);
    } catch {
      console.log(`${senderUsername}: [Encrypted Message]`);
    }
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
