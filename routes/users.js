const User = require('../models/user');
const Task = require('../models/task');

module.exports = function (router) {
    const usersRoute = router.route("/users");
    const usersIdRoute = router.route("/users/:id");

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

    // GET /users - Get all users
    usersRoute.get(async (req, res) => {
        try {
            const query = applyQueryParams(User.find(), req);
            const users = await query;
            res.status(200).json({ message: "OK", data: users });
        } catch (err) {
            res.status(500).json({ message: "Error retrieving users", data: err.message });
        }
    });

    // POST /users - Create a new user with validation
    usersRoute.post(async (req, res) => {
        try {
            const { name, email, pendingTasks = [] } = req.body;
    
            if (!name || !email) {
                return res.status(400).json({ message: "Name and email are required", data: {} });
            }
    
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User with this email already exists", data: {} });
            }
    
            const user = new User({
                name,
                email,
                pendingTasks,
                dateCreated: new Date(),
            });
    
            await user.save();
    
            if (pendingTasks.length > 0) {
                const taskIds = pendingTasks.map(taskId => taskId.toString());
    
                await Task.updateMany(
                    { _id: { $in: taskIds } },
                    { assignedUser: user._id, assignedUserName: user.name }
                );
            }
    
            res.status(201).json({ message: "User created", data: user });
        } catch (err) {
            res.status(500).json({ message: "Error creating user", data: err.message });
        }
    });
    
    // GET /users/:id - Get a specific user by ID
    usersIdRoute.get(async (req, res) => {
        try {
            const query = User.findById(req.params.id);
            if (req.query.select) {
                query.select(JSON.parse(req.query.select));
            }
    
            const user = await query;
    
            if (!user) {
                return res.status(404).json({ message: "User not found", data: {} });
            }
    
            res.status(200).json({ message: "OK", data: user });
        } catch (err) {
            res.status(500).json({ message: "Error retrieving user", data: err.message });
        }
    });

    // PUT /users/:id - Update a user with validation and check task assignments
    usersIdRoute.put(async (req, res) => {
        try {
            const { name, email, pendingTasks } = req.body;

            if (!name || !email) {
                return res.status(400).json({ message: "Name and email are required", data: {} });
            }

            const existingUser = await User.findOne({ email, _id: { $ne: req.params.id } });
            if (existingUser) {
                return res.status(400).json({ message: "User with this email already exists", data: {} });
            }

            const user = await User.findById(req.params.id);
            if (!user) return res.status(404).json({ message: "User not found", data: {} });

            if (pendingTasks) {
                const oldPendingTasks = user.pendingTasks.map(taskId => taskId.toString());
                const newPendingTasks = pendingTasks.map(taskId => taskId.toString());

                const conflictingTasks = await Task.find({
                    _id: { $in: newPendingTasks },
                    $and: [
                        { assignedUser: { $ne: null } },      
                        { assignedUser: { $ne: user._id } }       
                    ]
                });
                if (conflictingTasks.length > 0) {
                    return res.status(400).json({
                        message: "One or more tasks are already assigned to another user",
                        data: conflictingTasks.map(task => ({
                            taskId: task._id,
                            assignedUser: task.assignedUser
                        }))
                    });
                }

                const tasksToUnassign = oldPendingTasks.filter(taskId => !newPendingTasks.includes(taskId));
                await Task.updateMany(
                    { _id: { $in: tasksToUnassign } },
                    { assignedUser: null, assignedUserName: "unassigned" }
                );

                const tasksToAssign = newPendingTasks.filter(taskId => !oldPendingTasks.includes(taskId));
                await Task.updateMany(
                    { _id: { $in: tasksToAssign } },
                    { assignedUser: user._id, assignedUserName: user.name }
                );
            }

            const updatedUser = await User.findByIdAndUpdate(
                req.params.id,
                { name, email, pendingTasks },
                { new: true, runValidators: true }
            );

            res.status(200).json({ message: "User updated", data: updatedUser });
        } catch (err) {
            res.status(500).json({ message: "Error updating user", data: err.message });
        }
    });

    // DELETE /users/:id - Delete a user by ID
    usersIdRoute.delete(async (req, res) => {
        try {
            const user = await User.findByIdAndDelete(req.params.id);
            if (!user) return res.status(404).json({ message: "User not found", data: {} });

            await Task.updateMany(
                { assignedUser: user._id },
                { assignedUser: "", assignedUserName: "unassigned" }
            );

            res.status(200).json({ message: "User deleted", data: user });
        } catch (err) {
            res.status(500).json({ message: "Error deleting user", data: err.message });
        }
    });

    return router;
};
