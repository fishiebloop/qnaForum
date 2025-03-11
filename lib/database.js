const { MongoClient, ObjectId } = require("mongodb");
let client = null;

let collectionUsers = null;
let collectionQuestions = null;
let collectionAnswers = null;

async function initDBIfNecessary() {
  if (!client) {
    client = await MongoClient.connect("mongodb://localhost:27017");
    const db = client.db("is3106a1");
    collectionUsers = db.collection("users");
    collectionQuestions = db.collection("questions");
    collectionAnswers = db.collection("answers");
  }
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
  }
}

async function insertUser(user) {
  await initDBIfNecessary();
  user.created = new Date();
  await collectionUsers.insertOne(user);
}

async function getUserByUsername(username) {
  await initDBIfNecessary();
  return collectionUsers.findOne({
    username: username,
  });
}

async function getQuestions(
  sortBy = "recent",
  searchQuery = "",
  tagFilters = []
) {
  await initDBIfNecessary();

  let query = {};

  if (searchQuery) {
    query.title = { $regex: searchQuery, $options: "i" }; // Case-insensitive search
  }

  if (tagFilters.length > 0) {
    query.tags = { $all: tagFilters };
  }

  let sortOption = {};
  if (sortBy === "recent") {
    sortOption = { createdTime: -1 };
  } else if (sortBy === "hot") {
    sortOption = { answers: -1 };
  } else if (sortBy === "highest") {
    sortOption = { votes: -1 };
  } else {
    sortOption = { createdTime: -1 };
  }

  const questions = await collectionQuestions
    .find(query)
    .sort(sortOption)
    .toArray();

  return questions;
}

// Add a function to get a specific question by ID
async function getQuestionById(questionId) {
  await initDBIfNecessary();
  return collectionQuestions.findOne({ _id: new ObjectId(questionId) });
}

// Add a function to add a new question
async function addQuestion(question) {
  await initDBIfNecessary();
  return collectionQuestions.insertOne(question);
}

// Add a function to update question votes
async function updateQuestionVotes(questionId, voteChange) {
  await initDBIfNecessary();
  return collectionQuestions.updateOne(
    { _id: new ObjectId(questionId) },
    { $inc: { votes: voteChange } }
  );
}

// Add function to get answers for a question with sorting
async function getAnswersForQuestion(questionId, sortBy = "recent") {
  await initDBIfNecessary();
  
  let sortOption = {};
  if (sortBy === "votes") {
    sortOption = { votes: -1 }; // Highest votes first
  } else if (sortBy === "recent") {
    sortOption = { createdTime: -1 }; // Newest first
  } else if (sortBy === "oldest") {
    sortOption = { createdTime: 1 }; // Oldest first
  }
  
  return collectionAnswers
    .find({ questionId: new ObjectId(questionId) })
    .sort(sortOption)
    .toArray();
}

// Add function to add an answer
async function addAnswer(answer) {
  await initDBIfNecessary();
  
  // Insert the answer
  const result = await collectionAnswers.insertOne(answer);
  
  // Update the question's answer count
  await collectionQuestions.updateOne(
    { _id: new ObjectId(answer.questionId) },
    { $inc: { answers: 1 } }
  );
  
  return result;
}

// Add function to vote on an answer
async function updateAnswerVotes(answerId, voteChange) {
  await initDBIfNecessary();
  return collectionAnswers.updateOne(
    { _id: new ObjectId(answerId) },
    { $inc: { votes: voteChange } }
  );
}

// Add function to mark an answer as accepted
async function acceptAnswer(answerId, questionId) {
  await initDBIfNecessary();
  
  // First, clear any currently accepted answers for this question
  await collectionAnswers.updateMany(
    { questionId: new ObjectId(questionId) },
    { $set: { accepted: false } }
  );
  
  // Then mark the specified answer as accepted
  return collectionAnswers.updateOne(
    { _id: new ObjectId(answerId) },
    { $set: { accepted: true } }
  );
}

// Add function to check if the current user is the author of a question
async function isQuestionAuthor(questionId, userId) {
  await initDBIfNecessary();
  const question = await collectionQuestions.findOne({ 
    _id: new ObjectId(questionId),
    userId: userId 
  });
  return question !== null;
}

module.exports = {
  insertUser,
  disconnect,
  getUserByUsername,
  getQuestions,
  getQuestionById,
  addQuestion,
  updateQuestionVotes,
  getAnswersForQuestion,
  addAnswer,
  updateAnswerVotes,
  acceptAnswer,
  isQuestionAuthor,
  initDBIfNecessary,
};