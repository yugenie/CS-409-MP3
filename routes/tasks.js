const Task = require('../models/task');
const User = require('../models/user');

module.exports = function (router) {
    const tasksRoute = router.route("/tasks");
    const tasksIdRoute = router.route("/tasks/:id");

    // Helper function to apply query filters
    function applyQueryParams(query, req) {
        const { where, sort, select, skip, limit, count } = req.query;

        if (where) query.find(JSON.parse(where));
        if (sort) query.sort(JSON.parse(sort));
        if (select) query.select(JSON.parse(select));
        if (skip) query.skip(parseInt(skip));
        if (limit) query.limit(parseInt(limit) || 100);
        return count === "true" ? query.countDocuments() : query;
    }

    // GET /tasks - Get all tasks
    tasksRoute.get(async (req, res) => {
        try {
            const query = applyQueryParams(Task.find(), req);
            const tasks = await query;
            res.status(200).json({ message: "OK", data: tasks });
        } catch (err) {
            res.status(500).json({ message: "Error retrieving tasks", data: err.message });
        }
    });

    // GET /tasks/:id - Get a task by ID    
    tasksIdRoute.get(async (req, res) => {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ message: "Task not found", data: {} });
            }
            res.status(200).json({ message: "OK", data: task });
        } catch (err) {
            res.status(500).json({ message: "Error retrieving task", data: err.message });
        }
    });
    
    // POST /tasks - Create a new task with validation
    tasksRoute.post(async (req, res) => {
        try {
            const { name, deadline, description = "", completed = false, assignedUser = "" } = req.body;

            if (!name || !deadline) {
                return res.status(400).json({ message: "Name and deadline are required", data: {} });
            }
            const assignedUserId = assignedUser;

            const task = new Task({
                name,
                description,
                deadline,
                completed,
                assignedUser: assignedUserId,
                assignedUserName: assignedUserId ? (await User.findById(assignedUserId)).name : "unassigned",
                dateCreated: new Date(),
            });

            if (assignedUserId) {
                const user = await User.findById(assignedUserId);
                if (!user) throw new Error("Assigned user not found");
                user.pendingTasks.push(task._id);
                await user.save();
            }

            await task.save();
            res.status(201).json({ message: "Task created", data: task });
        } catch (err) {
            res.status(500).json({ message: "Error creating task", data: err.message });
        }
    });

    // PUT /tasks/:id - Update a task with validation
    tasksIdRoute.put(async (req, res) => {
        try {
            const { name, deadline, assignedUser } = req.body;

            if (!name || !deadline) {
                return res.status(400).json({ message: "Name and deadline are required", data: {} });
            }

            const assignedUserId = assignedUser;

            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ message: "Task not found", data: {} });

            if (assignedUserId && assignedUserId !== task.assignedUser) {
                if (task.assignedUser) {
                    const previousUser = await User.findById(task.assignedUser);
                    if (previousUser) {
                        previousUser.pendingTasks = previousUser.pendingTasks.filter(
                            taskId => taskId.toString() !== task._id.toString()
                        );
                        await previousUser.save();
                    }
                }

                const newUser = await User.findById(assignedUserId);
                if (newUser) {
                    newUser.pendingTasks.push(task._id);
                    await newUser.save();
                    req.body.assignedUserName = newUser.name;
                } else {
                    req.body.assignedUser = null;
                    req.body.assignedUserName = "unassigned";
                }
            }

            req.body.assignedUser = assignedUserId; 
            const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
            res.status(200).json({ message: "Task updated", data: updatedTask });
        } catch (err) {
            res.status(500).json({ message: "Error updating task", data: err.message });
        }
    });

    // DELETE /tasks/:id - Delete a task by ID
    tasksIdRoute.delete(async (req, res) => {
        try {
            const task = await Task.findByIdAndDelete(req.params.id);
            if (!task) return res.status(404).json({ message: "Task not found", data: {} });

            if (task.assignedUser) {
                const user = await User.findById(task.assignedUser);
                if (user) {
                    user.pendingTasks = user.pendingTasks.filter(taskId => taskId.toString() !== task._id.toString());
                    await user.save();
                }
            }

            res.status(200).json({ message: "Task deleted", data: task });
        } catch (err) {
            res.status(500).json({ message: "Error deleting task", data: err.message });
        }
    });

    return router;
};
