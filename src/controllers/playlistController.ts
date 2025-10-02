import { Request, Response } from "express";
import { Playlist } from "../models/Playlist";
import { Meditation } from "../models/Meditation";
import { logger } from "../utils/logger";
import { Types } from "mongoose";

export const getUserPlaylists = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    
    const playlists = await Playlist.find({ userId })
      .populate('meditations', 'title duration audioUrl category isPremium')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      playlists,
    });
  } catch (error) {
    logger.error("Error fetching playlists:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch playlists",
    });
  }
};

export const getPlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId } = req.params;
    
    const playlist = await Playlist.findById(playlistId)
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
  } catch (error) {
    logger.error("Error fetching playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch playlist",
    });
  }
};

export const createPlaylist = async (req: Request, res: Response) => {
  try {
    const { name, description, meditations, isPublic, tags } = req.body;
    const userId = new Types.ObjectId(req.user._id);

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Playlist name is required",
      });
    }

    const playlist = new Playlist({
      userId,
      name,
      description,
      meditations: meditations || [],
      isPublic: isPublic || false,
      tags: tags || [],
    });

    await playlist.save();

    const populatedPlaylist = await Playlist.findById(playlist._id)
      .populate('meditations', 'title duration audioUrl category');

    res.status(201).json({
      success: true,
      message: "Playlist created successfully",
      playlist: populatedPlaylist,
    });
  } catch (error) {
    logger.error("Error creating playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create playlist",
    });
  }
};

export const updatePlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId } = req.params;
    const { name, description, meditations, isPublic, tags } = req.body;
    const userId = req.user._id;

    const playlist = await Playlist.findById(playlistId);

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

    if (name !== undefined) playlist.name = name;
    if (description !== undefined) playlist.description = description;
    if (meditations !== undefined) playlist.meditations = meditations;
    if (isPublic !== undefined) playlist.isPublic = isPublic;
    if (tags !== undefined) playlist.tags = tags;

    await playlist.save();

    const updatedPlaylist = await Playlist.findById(playlist._id)
      .populate('meditations', 'title duration audioUrl category');

    res.json({
      success: true,
      message: "Playlist updated successfully",
      playlist: updatedPlaylist,
    });
  } catch (error) {
    logger.error("Error updating playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update playlist",
    });
  }
};

export const deletePlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId } = req.params;
    const userId = req.user._id;

    const playlist = await Playlist.findById(playlistId);

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

    await Playlist.findByIdAndDelete(playlistId);

    res.json({
      success: true,
      message: "Playlist deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete playlist",
    });
  }
};

export const addMeditationToPlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId } = req.params;
    const { meditationId } = req.body;
    const userId = req.user._id;

    const playlist = await Playlist.findById(playlistId);

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

    const meditation = await Meditation.findById(meditationId);
    if (!meditation) {
      return res.status(404).json({
        success: false,
        error: "Meditation not found",
      });
    }

    if (playlist.meditations.includes(new Types.ObjectId(meditationId))) {
      return res.status(400).json({
        success: false,
        error: "Meditation already in playlist",
      });
    }

    playlist.meditations.push(new Types.ObjectId(meditationId));
    await playlist.save();

    const updatedPlaylist = await Playlist.findById(playlist._id)
      .populate('meditations', 'title duration audioUrl category');

    res.json({
      success: true,
      message: "Meditation added to playlist",
      playlist: updatedPlaylist,
    });
  } catch (error) {
    logger.error("Error adding meditation to playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add meditation",
    });
  }
};

export const removeMeditationFromPlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId, meditationId } = req.params;
    const userId = req.user._id;

    const playlist = await Playlist.findById(playlistId);

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

    playlist.meditations = playlist.meditations.filter(
      id => id.toString() !== meditationId
    );
    
    await playlist.save();

    res.json({
      success: true,
      message: "Meditation removed from playlist",
    });
  } catch (error) {
    logger.error("Error removing meditation from playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove meditation",
    });
  }
};

export const getPublicPlaylists = async (req: Request, res: Response) => {
  try {
    const { limit = 20, page = 1, search } = req.query;
    
    const filter: any = { isPublic: true };
    
    if (search) {
      filter.$text = { $search: search as string };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const playlists = await Playlist.find(filter)
      .populate('meditations', 'title duration category')
      .populate('userId', 'name')
      .sort({ plays: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Playlist.countDocuments(filter);

    res.json({
      success: true,
      playlists,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        total,
      },
    });
  } catch (error) {
    logger.error("Error fetching public playlists:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch playlists",
    });
  }
};

export const forkPlaylist = async (req: Request, res: Response) => {
  try {
    const { playlistId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    const originalPlaylist = await Playlist.findById(playlistId);

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

    const forkedPlaylist = new Playlist({
      userId,
      name: `${originalPlaylist.name} (Copy)`,
      description: originalPlaylist.description,
      meditations: originalPlaylist.meditations,
      isPublic: false,
      tags: originalPlaylist.tags,
    });

    await forkedPlaylist.save();

    const populatedPlaylist = await Playlist.findById(forkedPlaylist._id)
      .populate('meditations', 'title duration audioUrl category');

    res.status(201).json({
      success: true,
      message: "Playlist forked successfully",
      playlist: populatedPlaylist,
    });
  } catch (error) {
    logger.error("Error forking playlist:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fork playlist",
    });
  }
};
