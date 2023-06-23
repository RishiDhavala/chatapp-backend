
const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const mongoose = require("mongoose");
const url =process.env.DATABASE||  
  "mongodb+srv://netflix:netflix@cluster0.yspy8dp.mongodb.net/chat-app";
const Users = require("./models/User");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Chat = require("./models/Chat");
const Messages = require("./models/Message");
const cors = require("cors");
const PORT=process.env.PORTNUMBER || 8080
const io=require("socket.io")(PORT,{
  cors:{
    origin:['http://localhost:5173','https://chat-with-me-oh08.onrender.com','https://chat-with-me-server.onrender.com']
  }
})
const BASE_URL=process.env.BASE_URL



app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

app.listen(port, () => {
  console.log("listening on port " + port);
});

//socket io
let users=[];
io.on('connection',socket=>{
  console.log('User connected ',socket.id);
  socket.on('addUser',userId=>{
    const userExist=users.find(user=>user.userid===userId);
    if(!userExist){
      const user={userId,socketId:socket.id};
      users.push(user);
      io.emit('getUsers',users);
    }
  });

  socket.on('sendMessage',async({senderId,receiverId,message,chatId})=>{
const receiver=users.find(user=>user.userId===receiverId)
const sender=users.find(user=>user.userId===senderId)
const user=await Users.findById(senderId)
if(receiver){
  io.to(sender.socketId).to(receiver.socketId).emit('getMessage',{
    senderId,
    message,
    chatId,
    receiverId,
    user:{id:user._id,fullName:user.fullName,email:user.email}
  });
}else{
   io.to(sender.socketId).emit('getMessage',{
    senderId,
    message,
    chatId,
    receiverId,
    user:{id:user._id,fullName:user.fullName,email:user.email}
  });
}
  });

  socket.on('disconnect',()=>{
    users=users.filter(user=>user.socketId!==socket.id)
    io.emit('getUsers',users);
  })
})



mongoose
  .connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("connnected to DB"))
  .catch((e) => console.log(e));

//register user
app.post("/api/register", async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      res.status(400).send("Please fill the required fields");
    } else {
      const alreadyExist = await Users.findOne({ email });
      if (alreadyExist) {
        res.status(400).send("User already exists");
      } else {
        const newUser = new Users({ fullName, email });
        bcryptjs.hash(password, 10, (err, hashedPassword) => {
          newUser.set("password", hashedPassword);
          newUser.save();
          next();
        });
        return res.status(200).json("User registered successfully");
      }
    }
  } catch (error) {
    res.status(400).send(error);
  }
});

//user login
app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).send("Please fill the required fields");
    } else {
      const user = await Users.findOne({ email });
      if (!user) {
        res.status(400).send("User not found");
      } else {
        const validateUser = await bcryptjs.compare(password, user.password);
        if (!validateUser) {
          res.status(400).send("Password incorrect");
        } else {
          const payload = {
            userId: user._id,
            email: user.email,
          };
          const JWT_SECRET_KEY =
            process.env.JWT_SECRET_KEY || "THIS_IS_A_SECRET_KEY";

          jwt.sign(
            payload,
            JWT_SECRET_KEY,
            { expiresIn: 84600 },
            async (err, token) => {
              await Users.updateOne(
                { _id: user._id },
                {
                  $set: { token },
                }
              );
              user.save();
              res.status(200).json({
                user: {
                  id: user._id,
                  email: user.email,
                  fullName: user.fullName,
                },
                token: token,
              });
            }
          );
          //:{email:user.email,fullName:user.fullName},token:user.token });
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
});

//chat
app.post("/api/chat", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newChat = new Chat({ members: [senderId, receiverId] });
    await newChat.save();
    res.status(200).send("Chat created succesfully");
  } catch (error) {
    console.log(error);
  }
});

app.get("/api/chat", async (req, res) => {});

//get receiver
app.get("/api/chat/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const chats = await Chat.find({ members: { $in: [userId] } });
    const chatUserData = Promise.all(
      chats.map(async (chat) => {
        const receiverId = chat.members.find((member) => member !== userId);
        const receiver = await Users.findById(receiverId);
        return {
          receiver: {
            receiverId: receiver._id,
            email: receiver.email,
            fullName: receiver.fullName,
          },
          chatId: chat._id,
          receiverId: receiver._id,
        };
      })
    );
    res.status(200).json(await chatUserData);
  } catch (error) {
    console.log(error);
  }
});

//post message

app.post("/api/message", async (req, res) => {
  try {
    const { chatId, senderId, message, receiverId } = req.body;
    if (!senderId || !message)
      return res.status(200).send("Please fill the required fields");
    if (chatId === "new" && receiverId) {
      const newChat = new Chat({ members: [senderId, receiverId] });
      await newChat.save();
      const newMessage = new Messages({ chatId:newChat._id, senderId, message });
      await newMessage.save();
      res.status(200).send("Message sent successfully");
    } else if (!chatId && !receiverId) {
      return res.status(200).send("Please fill the required fields");
    }
    const newMessage = new Messages({ chatId, senderId, message });
    await newMessage.save();
    res.status(200).send("Message sent successfully");
  } catch (error) {
    console.log(error);
  }
});

//get message
app.get("/api/message/:chatId", async (req, res) => {
  try {
    const checkMessages = async (chatId) => {
     //console.log(chatId);
      const messages = await Messages.find({ chatId });
      const messageUserData = Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { id: user._id, email: user.email, fullName: user.fullName },
            message: message.message,
          };
        })
      );
      res.status(200).json(await messageUserData);
    };

    const chatId = req.params.chatId;
    if (chatId === "new") {
      const checkChats = await Chat.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });
      if (checkChats.length > 0)
      {
        console.log(checkChats[0]._id)
        checkMessages(checkChats._id);
      }
      else {
        return res.status(200).json([]);
      }
    } else {
      checkMessages(chatId);
    }
  } catch (error) {
    console.log(error);
  }
});

//get all users
app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await Users.find({ _id: { $ne: userId } });
    const usersData = Promise.all(
      users.map(async (user) => {
        return {
          user: {
            email: user.email,
            fullName: user.fullName,
            receiverId: user._id,
          },
          //userId: user._id,
        };
      })
    );
    res.status(200).json(await usersData);
  } catch (error) {
    console.log(error);
  }
});
