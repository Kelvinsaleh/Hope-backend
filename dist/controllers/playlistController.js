"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forkPlaylist = exports.getPublicPlaylists = exports.removeMeditationFromPlaylist = exports.addMeditationToPlaylist = exports.deletePlaylist = exports.updatePlaylist = exports.createPlaylist = exports.getPlaylist = exports.getUserPlaylists = void 0;
const Playlist_1 = require("../models/Playlist");
const Meditation_1 = require("../models/Meditation");
const logger_1 = require("../utils/logger");
const mongoose_1 = require("mongoose");
const getUserPlaylists = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const playlists = await Playlist_1.Playlist.find({ userId })
            .populate('meditations', 'title duration audioUrl category isPremium')
            .sort({ updatedAt: -1 });
        res.json({
            success: true,
            playlists,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching playlists:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch playlists",
        });
    }
};
exports.getUserPlaylists = getUserPlaylists;
const getPlaylist = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const playlist = await Playlist_1.Playlist.findById(playlistId)
            .populate('meditations', 'title duration audioUrl category isPremium tags')
            .populate('userId', 'name email');
        if (!playlist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (!playlist.isPublic && playlist.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                error: "Access denied",
            });
        }
        playlist.plays += 1;
        await playlist.save();
        res.json({
            success: true,
            playlist,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch playlist",
        });
    }
};
exports.getPlaylist = getPlaylist;
const createPlaylist = async (req, res) => {
    try {
        const { name, description, meditations, isPublic, tags } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!name) {
            return res.status(400).json({
                success: false,
                error: "Playlist name is required",
            });
        }
        const playlist = new Playlist_1.Playlist({
            userId,
            name,
            description,
            meditations: meditations || [],
            isPublic: isPublic || false,
            tags: tags || [],
        });
        await playlist.save();
        const populatedPlaylist = await Playlist_1.Playlist.findById(playlist._id)
            .populate('meditations', 'title duration audioUrl category');
        res.status(201).json({
            success: true,
            message: "Playlist created successfully",
            playlist: populatedPlaylist,
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create playlist",
        });
    }
};
exports.createPlaylist = createPlaylist;
const updatePlaylist = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const { name, description, meditations, isPublic, tags } = req.body;
        const userId = req.user._id;
        const playlist = await Playlist_1.Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (playlist.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                error: "You can only update your own playlists",
            });
        }
        if (name !== undefined)
            playlist.name = name;
        if (description !== undefined)
            playlist.description = description;
        if (meditations !== undefined)
            playlist.meditations = meditations;
        if (isPublic !== undefined)
            playlist.isPublic = isPublic;
        if (tags !== undefined)
            playlist.tags = tags;
        await playlist.save();
        const updatedPlaylist = await Playlist_1.Playlist.findById(playlist._id)
            .populate('meditations', 'title duration audioUrl category');
        res.json({
            success: true,
            message: "Playlist updated successfully",
            playlist: updatedPlaylist,
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update playlist",
        });
    }
};
exports.updatePlaylist = updatePlaylist;
const deletePlaylist = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const userId = req.user._id;
        const playlist = await Playlist_1.Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (playlist.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                error: "You can only delete your own playlists",
            });
        }
        await Playlist_1.Playlist.findByIdAndDelete(playlistId);
        res.json({
            success: true,
            message: "Playlist deleted successfully",
        });
    }
    catch (error) {
        logger_1.logger.error("Error deleting playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete playlist",
        });
    }
};
exports.deletePlaylist = deletePlaylist;
const addMeditationToPlaylist = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const { meditationId } = req.body;
        const userId = req.user._id;
        const playlist = await Playlist_1.Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (playlist.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                error: "Access denied",
            });
        }
        const meditation = await Meditation_1.Meditation.findById(meditationId);
        if (!meditation) {
            return res.status(404).json({
                success: false,
                error: "Meditation not found",
            });
        }
        if (playlist.meditations.includes(new mongoose_1.Types.ObjectId(meditationId))) {
            return res.status(400).json({
                success: false,
                error: "Meditation already in playlist",
            });
        }
        playlist.meditations.push(new mongoose_1.Types.ObjectId(meditationId));
        await playlist.save();
        const updatedPlaylist = await Playlist_1.Playlist.findById(playlist._id)
            .populate('meditations', 'title duration audioUrl category');
        res.json({
            success: true,
            message: "Meditation added to playlist",
            playlist: updatedPlaylist,
        });
    }
    catch (error) {
        logger_1.logger.error("Error adding meditation to playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to add meditation",
        });
    }
};
exports.addMeditationToPlaylist = addMeditationToPlaylist;
const removeMeditationFromPlaylist = async (req, res) => {
    try {
        const { playlistId, meditationId } = req.params;
        const userId = req.user._id;
        const playlist = await Playlist_1.Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (playlist.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                error: "Access denied",
            });
        }
        playlist.meditations = playlist.meditations.filter(id => id.toString() !== meditationId);
        await playlist.save();
        res.json({
            success: true,
            message: "Meditation removed from playlist",
        });
    }
    catch (error) {
        logger_1.logger.error("Error removing meditation from playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to remove meditation",
        });
    }
};
exports.removeMeditationFromPlaylist = removeMeditationFromPlaylist;
const getPublicPlaylists = async (req, res) => {
    try {
        const { limit = 20, page = 1, search } = req.query;
        const filter = { isPublic: true };
        if (search) {
            filter.$text = { $search: search };
        }
        const skip = (Number(page) - 1) * Number(limit);
        const playlists = await Playlist_1.Playlist.find(filter)
            .populate('meditations', 'title duration category')
            .populate('userId', 'name')
            .sort({ plays: -1, createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));
        const total = await Playlist_1.Playlist.countDocuments(filter);
        res.json({
            success: true,
            playlists,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                total,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching public playlists:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch playlists",
        });
    }
};
exports.getPublicPlaylists = getPublicPlaylists;
const forkPlaylist = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const originalPlaylist = await Playlist_1.Playlist.findById(playlistId);
        if (!originalPlaylist) {
            return res.status(404).json({
                success: false,
                error: "Playlist not found",
            });
        }
        if (!originalPlaylist.isPublic) {
            return res.status(403).json({
                success: false,
                error: "Cannot fork private playlist",
            });
        }
        const forkedPlaylist = new Playlist_1.Playlist({
            userId,
            name: `${originalPlaylist.name} (Copy)`,
            description: originalPlaylist.description,
            meditations: originalPlaylist.meditations,
            isPublic: false,
            tags: originalPlaylist.tags,
        });
        await forkedPlaylist.save();
        const populatedPlaylist = await Playlist_1.Playlist.findById(forkedPlaylist._id)
            .populate('meditations', 'title duration audioUrl category');
        res.status(201).json({
            success: true,
            message: "Playlist forked successfully",
            playlist: populatedPlaylist,
        });
    }
    catch (error) {
        logger_1.logger.error("Error forking playlist:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fork playlist",
        });
    }
};
exports.forkPlaylist = forkPlaylist;
