const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator/check');

const io = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
    const currentPage = req.query.page || 1;
    const perPage = 2;
    try {
        const totalItems = await Post
            .find()
            .countDocuments();

        const posts = await Post
            .find()
            .populate('creator')
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage);

        res.status(200).json({
            message: 'Posts fetched successfully',
            posts: posts,
            totalItems: totalItems
        });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

exports.createPost = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data is incorrect');
        error.statusCode = 422;
        throw error;
    }

    if (!req.file) {
        const error = new Error('No image provided');
        error.statusCode = 422;
        throw error;
    }
    const title = req.body.title;
    const content = req.body.content;
    const imageUrl = req.file.path;
    const post = new Post({
        title: title,
        content: content,
        imageUrl: imageUrl,
        creator: req.userId
    });

    try {
        await post.save();

        const user = await User.findById(req.userId);

        user.posts.push(post);
        await user.save();

        io.getIO().emit('posts', {
            action: 'create',
            post: post
        });
        res.status(201).json({
            message: 'Post was succsessfully added!',
            post: post,
            creator: { _id: user._id, name: user.name }
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

exports.getPost = async (req, res, next) => {
    const postId = req.params.postId;
    try {
        const post = await Post.findById(postId)

        if (!post) {
            const error = new Error('Could not found post');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            message: 'Post fetched',
            post: post
        });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

exports.updatePost = async (req, res, next) => {
    const postId = req.params.postId;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data is incorrect');
        error.statusCode = 422;
        throw error;
    }

    const title = req.body.title;
    const content = req.body.content;
    let imageUrl = req.body.image;
    if (req.file) {
        imageUrl = req.file.path;
    }

    if (!imageUrl) {
        const error = new Error('No file picked');
        error.statusCode = 422;
        throw error;
    }

    try {
        const post = await (await Post.findById(postId)).populate('creator');

        if (!post) {
            const error = new Error('No post found');
            error.statusCode = 422;
            throw error;
        }

        if (req.userId !== post.creator._id.toString()) {
            const error = new Error('Not authorized');
            error.statusCode = 403;
            throw error;
        }

        if (imageUrl !== post.imageUrl) {
            clearImage(post.imageUrl);
        }

        post.title = title;
        post.imageUrl = imageUrl;
        post.content = content;

        await post.save();
        io.getIO().emit('posts', {
            action: 'update',
            post: post
        });
        res.status(200).json({ message: 'Post was updated', post: post });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

exports.deletePost = async (req, res, next) => {
    const postId = req.params.postId;

    try {
        const post = await Post.findById(postId);

        if (!post) {
            const error = new Error('No post found');
            error.statusCode = 422;
            throw error;
        }

        if (req.userId !== post.creator.toString()) {
            const error = new Error('Not authorized');
            error.statusCode = 403;
            throw error;
        }

        clearImage(post.imageUrl);

        await Post.findByIdAndRemove(postId);

        const user = await User.findById(req.userId);

        user.posts.pull(postId);
        await user.save();

        io.getIO().emit('posts', {
            action: 'delete',
            post: post
        })
        res.status(200).json({ message: 'Post was deleted.' });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

const clearImage = (filePath) => {
    filePath = path.join(__dirname, '..', filePath);
    fs.unlink(filePath, err => {
        console.log(err);
    })
}