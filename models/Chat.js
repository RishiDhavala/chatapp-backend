const mongoose=require('mongoose');

const chatSchema=mongoose.Schema({
    members:{
        type:Array,
        required:true,
    }
});

const Chat=mongoose.model('Chat',chatSchema);
module.exports=Chat; 