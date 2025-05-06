require("dotenv").config();

const config = require("./config.json");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const User = require("./models/user.model");
const TravelStory = require("./models/travelStory.model");
const { authenticateToken } = require("./utilities");
const upload = require("./multer");
const fs = require("fs");
const path = require("path");

const cloudinary = require("cloudinary").v2;

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

mongoose.connect(config.connectionString);

const app = express();
app.use(express.json());
// app.use(cors({ origin: "*" }));
app.use(
	cors({
		origin: [
			"http://localhost:5173",
			"https://travel-story-fe-error.vercel.app/",
		],
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		credentials: true, // Nếu dùng cookie hoặc xác thực
		allowedHeaders: ["Content-Type", "Authorization"],
	})
);
app.options("*", cors());

app.get("/", async (req, res) => {
	res.send("Hello from backend!");
});

// Create Account
app.post("/create-account", async (req, res) => {
	const { fullName, email, password } = req.body;

	if (!fullName || !email || !password) {
		return res
			.status(400)
			.json({ error: true, message: "All fields are required" });
	}

	const isUser = await User.findOne({ email });
	if (isUser) {
		return res
			.status(400)
			.json({ error: true, message: "User already exists" });
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	const user = new User({
		fullName,
		email,
		password: hashedPassword,
	});

	await user.save();
	const accessToken = jwt.sign(
		{ userId: user._id },
		process.env.ACCESS_TOKEN_SECRET,
		{
			expiresIn: "72h",
		}
	);
	return res.status(201).json({
		error: false,
		user: { fullName: user.fullName, email: user.email },
		accessToken,
		message: "Registration Successful",
	});
});

// Login
app.post("/login", async (req, res) => {
	const { email, password } = req.body;
	if (!email || !password) {
		return res.status(400).json({ message: "Email and Password are required" });
	}

	// const user = await User.findOne({ email });
	const user = await User.findOne(req.body);

	if (!user) {
		return res.status(400).json({ message: "User not found" });
	}
	const accessToken = jwt.sign(
		{ userId: user?._id },
		process.env.ACCESS_TOKEN_SECRET,
		{ expiresIn: "72h" }
	);

	res.json({
		error: false,
		message: "Login Successful (INJECTED)",
		user: {
			fullName: user.fullName,
			email: user.email,
			accessToken,
		},
	});

	// const isPasswordValid = await bcrypt.compare(password, user.password);
	// if (!isPasswordValid) {
	// 	return res.status(400).json({ message: "Invalid Credentials" });
	// }

	// return res.json({
	// 	error: false,
	// 	message: "Login Successful",
	// 	user: { fullName: user.fullName, email: user.email },
	// 	accessToken,
	// });
});

// Get User
app.get("/get-user", authenticateToken, async (req, res) => {
	const { userId } = req.user;
	const isUser = await User.findOne({ _id: userId });
	if (!isUser) {
		return res.sendStatus(401);
	}
	return res.json({
		user: isUser,
		message: "",
	});
});

// Route to handle image upload
app.post("/image-upload", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res
				.status(400)
				.json({ error: true, message: "No image uploaded" });
		}
		const result = await cloudinary.uploader
			.upload_stream(
				{ folder: "travel-stories" }, // Tùy chọn: lưu ảnh trong thư mục 'travel-stories' trên Cloudinary
				(error, result) => {
					if (error) {
						return res
							.status(500)
							.json({ error: true, message: "Upload to Cloudinary failed" });
					}
					res.status(201).json({ imageUrl: result.secure_url });
				}
			)
			.end(req.file.buffer);

		// const imageUrl = `./uploads/${req.file.filename}`;

		// res.status(201).json({ imageUrl });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Delete an image from uploads folder
app.delete("/delete-image", async (req, res) => {
	const { imageUrl } = req.query;

	if (!imageUrl) {
		return res
			.status(400)
			.json({ error: true, message: "imageUrl parameter is required" });
	}

	try {
		// // Extract the filename from the imageUrl
		// const filename = path.basename(imageUrl);

		// // Define the file path
		// const filePath = path.join(__dirname, "uploads", filename);

		// // Check if the file exists
		// if (fs.existsSync(filePath)) {
		// 	// Delete the file from the uploads folder
		// 	fs.unlinkSync(filePath);
		// 	res.status(200).json({ message: "Image deleted successfully" });
		// } else {
		// 	res.status(200).json({ error: true, message: "Image not found" });
		// }
		// Lấy public_id từ URL của Cloudinary
		const publicId = imageUrl.split("/").slice(-1)[0].split(".")[0]; // Ví dụ: 'travel-stories/filename'
		await cloudinary.uploader.destroy(`travel-stories/${publicId}`);
		res.status(200).json({ message: "Image deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Serve static files from the uploads and assets directory
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Add Travel Story
app.post("/add-travel-story", authenticateToken, async (req, res) => {
	const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
	const { userId } = req.user;

	//Validate required fields
	if (!title || !story || !visitedLocation || !imageUrl || !visitedDate) {
		return res
			.status(400)
			.json({ error: true, message: "All fields are required" });
	}

	// Convert visitedDate from milliseconds to Date object
	const parsedVisitedDate = new Date(parseInt(visitedDate));

	try {
		const travelStory = new TravelStory({
			title,
			story,
			visitedLocation,
			userId,
			imageUrl,
			visitedDate: parsedVisitedDate,
		});

		await travelStory.save();
		res.status(201).json({ story: travelStory, message: "Added Successfully" });
	} catch (error) {
		res.status(400).json({ error: true, message: error.message });
	}
});

// Get All Travel Stories
app.get("/get-all-stories", authenticateToken, async (req, res) => {
	const { userId } = req.user;
	try {
		const travelStories = await TravelStory.find({ userId: userId }).sort({
			isFavourite: -1,
		});
		res.status(200).json({ stories: travelStories });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Edit Travel Story
app.put("/edit-story/:id", authenticateToken, async (req, res) => {
	const { id } = req.params;
	const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
	const { userId } = req.user;

	//Validate required fields
	if (!title || !story || !visitedLocation || !visitedDate) {
		return res
			.status(400)
			.json({ error: true, message: "All fields are required" });
	}

	// Convert visitedDate from milliseconds to Date object
	const parsedVisitedDate = new Date(parseInt(visitedDate));

	try {
		// Find the travel story by ID and ensure it belongs to the authenticated user
		const travelStory = await TravelStory.findOne({ _id: id, userId: userId });

		if (!travelStory) {
			return res
				.status(404)
				.json({ error: true, message: "Travel story not found" });
		}

		const placeholderImgUrl = `./assets/placeholder.png`;

		travelStory.title = title;
		travelStory.story = story;
		travelStory.visitedLocation = visitedLocation;
		travelStory.imageUrl = imageUrl || placeholderImgUrl;
		travelStory.visitedDate = parsedVisitedDate;

		await travelStory.save();
		res
			.status(200)
			.json({ story: travelStory, message: "Update Successfully" });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Delete a travel story
app.delete("/delete-story/:id", authenticateToken, async (req, res) => {
	const { id } = req.params;
	const { userId } = req.user;

	try {
		// Find the travel story by ID and ensure it belongs to the authenticated user
		const travelStory = await TravelStory.findOne({ _id: id, userId: userId });

		if (!travelStory) {
			return res
				.status(404)
				.json({ error: true, message: "Travel story not found" });
		}

		// Xóa ảnh từ Cloudinary
		if (
			travelStory.imageUrl &&
			!travelStory.imageUrl.includes("placeholder.png")
		) {
			const publicId = travelStory.imageUrl
				.split("/")
				.slice(-1)[0]
				.split(".")[0];
			await cloudinary.uploader.destroy(`travel-stories/${publicId}`);
		}

		// Delete the travel story from the database
		await travelStory.deleteOne({ _id: id, userId: userId });

		// // Extract the filename from the imageUrl
		// const imageUrl = travelStory.imageUrl;
		// const filename = path.basename(imageUrl);

		// // Define the file path
		// const filePath = path.join(__dirname, "uploads", filename);

		// // Delete the image file from the uploads folder
		// fs.unlinkSync(filePath, (err) => {
		// 	if (err) {
		// 		console.error("Failed to delete image file:", err);
		// 		// Optionally, you could still respond with a success status here
		// 		// If you don't want to treat this as a critical error
		// 	}
		// });

		res.status(200).json({ message: "Travel story deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Update isFavourite
app.put("/update-is-favourite/:id", authenticateToken, async (req, res) => {
	const { id } = req.params;
	const { isFavourite } = req.body;
	const { userId } = req.user;

	try {
		const travelStory = await TravelStory.findOne({ _id: id, userId: userId });
		if (!travelStory) {
			return res
				.status(404)
				.json({ error: true, message: "Travel story not found" });
		}

		travelStory.isFavourite = isFavourite;
		await travelStory.save();
		res
			.status(200)
			.json({ story: travelStory, message: "Update Successfully" });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Search travel stories
app.get("/search", authenticateToken, async (req, res) => {
	const { query } = req.query;
	const { userId } = req.user;

	if (!query) {
		return res.status(404).json({ error: true, message: "Query is required" });
	}

	try {
		const searchResults = await TravelStory.find({
			userId: userId,
			$or: [
				{ title: { $regex: query, $options: "i" } },
				{ story: { $regex: query, $options: "i" } },
				{ visitedLocation: { $regex: query, $options: "i" } },
			],
		}).sort({ isFavourite: -1 });

		res.status(200).json({ stories: searchResults });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

// Filter travel stories by date range
app.get("/travel-stories/filter", authenticateToken, async (req, res) => {
	const { startDate, endDate } = req.query;
	const { userId } = req.user;

	try {
		// Convert startDate and endDate from milliseconds to Date objects
		const start = new Date(parseInt(startDate));
		const end = new Date(parseInt(endDate));

		// Find travel stories that belong to the authenticated user and fall within the date range
		const filteredStories = await TravelStory.find({
			userId: userId,
			visitedDate: { $gte: start, $lte: end },
		}).sort({ isFavourite: -1 });

		res.status(200).json({ stories: filteredStories });
	} catch (error) {
		res.status(500).json({ error: true, message: error.message });
	}
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server running on port ${port}`));
module.exports = app;
