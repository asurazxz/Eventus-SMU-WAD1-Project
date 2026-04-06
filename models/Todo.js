const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    // Owner of this todo item
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
      default: "medium"
    },
    deadline: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending"
    }
  },
  { timestamps: true }
);

// Returns all todos for a user, sorted by the requested field.
todoSchema.statics.getTodosByUser = async function (currentUser, sortBy) {
  const todos = await this.find({ user: currentUser });

  if (sortBy === "deadline") {
    todos.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  } else {
    const weight = { high: 0, medium: 1, low: 2 };
    todos.sort((a, b) => {
      const byPriority = weight[a.priority] - weight[b.priority];
      if (byPriority !== 0) return byPriority;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  }

  return todos;
};

// Returns a single todo by its document ID
todoSchema.statics.getTodoById = function (todoId) {
  return this.findById(todoId);
};

// Creates and saves a new todo document
todoSchema.statics.createTodo = function (todoData) {
  const todo = new this(todoData);
  return todo.save();
};

// Updates a todo by ID and returns the updated document
todoSchema.statics.updateTodoById = function (todoId, updateData) {
  return this.findByIdAndUpdate(todoId, updateData, { returnDocument: "after" });
};

// Deletes a todo by ID
todoSchema.statics.deleteTodoById = function (todoId) {
  return this.findByIdAndDelete(todoId);
};

// Deletes all todos belonging to a user
todoSchema.statics.deleteByUser = function (userId) {
  return this.deleteMany({ user: userId });
};

// Validates todo input data before create/update.
todoSchema.statics.validateInput = function (data) {
  const errors = {};
  if (!data.title || String(data.title).trim() === "") {
    errors.title = "Title is required";
  }
  const priorities = ["low", "medium", "high"];
  if (!data.priority || !priorities.includes(data.priority)) {
    errors.priority = "Priority must be low, medium or high";
  }
  if (!data.deadline) {
    errors.deadline = "Deadline is required";
  } else {
    const d = new Date(data.deadline);
    d.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (d.getTime() < today.getTime()) {
      errors.deadline = "Deadline cannot be before today";
    }
  }
  return Object.keys(errors).length ? errors : null;
};

module.exports = mongoose.model("Todo", todoSchema);
