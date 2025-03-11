const express = require("express");
const app = express();
const port = 3000;
const bodyParser = require("body-parser");
const {
  insertUser,
  getUserByUsername,
  getQuestions,
  getQuestionById,
  getAnswersForQuestion,
  addAnswer,
  updateAnswerVotes,
  acceptAnswer,
  isQuestionAuthor,
  initDBIfNecessary,
  updateQuestionVotes,
} = require("./lib/database");
const session = require("express-session");
const { MongoClient, ObjectId } = require("mongodb");

app.use(express.static("public"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next(); //continue - pass to the next middleware
  } else {
    //bounce the user to the login page
    res.redirect("/login");
  }
}

app.set("view engine", "ejs");

app.use(
  session({
    secret: "SOME_SECRET_KEY",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, //setting this false for http connections
    },
  })
);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

app.post("/users/add", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.send("Passwords do not match!");
  }

  await insertUser({ username, email, password });

  console.log("New User:", { username, email, password });

  res.redirect("/home");
});

app.post("/dologin", async (req, res) => {
  const { username, password } = req.body;
  const foundUser = await getUserByUsername(username);
  if (foundUser && foundUser.password === password) {
    req.session.userId = foundUser._id;
    req.session.username = foundUser.username; // Store username for author field
    res.redirect("home");
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => {
  req.session.userId = null;
  res.redirect("/login");
});

// Update the /home route to handle search, sorting and tag filtering
app.get("/home", requireAuth, async (req, res) => {
  try {
    const sortBy = req.query.sort || "recent";
    const searchQuery = req.query.search || "";
    const tagFilters = req.query.tag ? [].concat(req.query.tag) : [];

    // Fetch questions from the database
    const questions = await getQuestions(sortBy, searchQuery, tagFilters);

    res.render("home", {
      questions: questions || [], // Ensure it's always an array
      sortBy,
      search: searchQuery,
      selectedTags: tagFilters,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.render("home", {
      questions: [], // Pass an empty array to avoid EJS errors
      sortBy: "recent",
      search: "",
      selectedTags: [],
    });
  }
});

// Add a route to handle question submission
app.post("/submit-question", requireAuth, async (req, res) => {
  try {
    const { title, body, tags } = req.body;

    // Ensure tags are an array (convert comma-separated string to an array)
    const tagArray = tags.split(",").map((tag) => tag.trim());

    const question = {
      title,
      body,
      tags: tagArray, // Store as an array
      createdTime: new Date(),
      userId: req.session.userId,
      author: req.session.username, // Add the author's username
      votes: 0,
      answers: 0,
    };

    await initDBIfNecessary();
    const client = await MongoClient.connect("mongodb://localhost:27017");
    const db = client.db("is3106a1");
    const collectionQuestions = db.collection("questions");
    await collectionQuestions.insertOne(question);

    res.redirect("/home");
  } catch (error) {
    console.error("Error submitting question:", error);
    res.send("Error submitting question.");
  }
});

// Updated question detail route with answers
app.get("/question/:id", requireAuth, async (req, res) => {
  try {
    const questionId = req.params.id;
    const sortBy = req.query.sort || "recent";
    
    // Get the question details
    const question = await getQuestionById(questionId);
    
    if (!question) {
      return res.status(404).send("Question not found");
    }
    
    // Get answers for the question with the specified sort order
    const answers = await getAnswersForQuestion(questionId, sortBy);
    
    // Check if the current user is the author of the question
    const isAuthor = await isQuestionAuthor(questionId, req.session.userId);
    
    res.render("question", { 
      question,
      answers,
      sortBy,
      isQuestionAuthor: isAuthor
    });
  } catch (error) {
    console.error("Error fetching question:", error);
    res.status(500).send("Error loading question details.");
  }
});

// Add a route to handle answer submission
app.post("/submit-answer", requireAuth, async (req, res) => {
  try {
    const { question_id, answer, code } = req.body;
    
    const newAnswer = {
      body: answer,
      code: code || null,
      questionId: new ObjectId(question_id),
      createdTime: new Date(),
      userId: req.session.userId,
      author: req.session.username, // Add the author's username
      votes: 0,
      accepted: false
    };
    
    await addAnswer(newAnswer);
    
    res.redirect(`/question/${question_id}`);
  } catch (error) {
    console.error("Error submitting answer:", error);
    res.status(500).send("Error submitting answer.");
  }
});

// Add a route to handle voting on questions
app.post("/vote", requireAuth, async (req, res) => {
  try {
    const { question_id, vote_type } = req.body;
    
    // Update vote count
    const voteChange = vote_type === "up" ? 1 : -1;
    await updateQuestionVotes(question_id, voteChange);
    
    // Redirect back to the previous page
    res.redirect("back");
  } catch (error) {
    console.error("Error processing vote:", error);
    res.status(500).send("Error processing vote");
  }
});

// Add a route to handle voting on answers
app.post("/vote-answer", requireAuth, async (req, res) => {
  try {
    const { answer_id, question_id, vote_type } = req.body;
    
    // Update vote count
    const voteChange = vote_type === "up" ? 1 : -1;
    await updateAnswerVotes(answer_id, voteChange);
    
    // Redirect back to the question page
    res.redirect(`/question/${question_id}`);
  } catch (error) {
    console.error("Error processing answer vote:", error);
    res.status(500).send("Error processing vote");
  }
});

// Add a route to handle accepting an answer
app.post("/accept-answer", requireAuth, async (req, res) => {
  try {
    const { answer_id, question_id } = req.body;
    
    // Check if the current user is the question author
    const isAuthor = await isQuestionAuthor(question_id, req.session.userId);
    
    if (!isAuthor) {
      return res.status(403).send("Only the question author can accept answers");
    }
    
    // Mark the answer as accepted
    await acceptAnswer(answer_id, question_id);
    
    // Redirect back to the question page
    res.redirect(`/question/${question_id}`);
  } catch (error) {
    console.error("Error accepting answer:", error);
    res.status(500).send("Error accepting answer");
  }
});