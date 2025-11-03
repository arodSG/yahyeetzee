import ScoreCard from './ScoreCard.js';

export default class Player {
    constructor(uuid, socketId, userId, displayName) { // Use uuid to find Player when they connect and update their socketId. This is needed to maintain the socket connection between page changes/refreshes.
        this.uuid = uuid;
        this.socketId = socketId;
        this.userId = userId;
        this.displayName = displayName;
        this.scorecard = new ScoreCard(socketId);
    }
}