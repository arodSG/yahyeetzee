export default class ScoreCard {
    constructor(socketId) {
        this.socketId = socketId;
        this.allCategoriesDone = false;
        this.numYahtzees = 0;
        this.scoreVals = {
            ones: -1,
            twos: -1,
            threes: -1,
            fours: -1,
            fives: -1,
            sixes: -1,
            totalNoBonus: -1,
            bonus: -1,
            threeOfAKind: -1,
            fourOfAKind: -1,
            fullHouse: -1,
            smallStraight: -1,
            largeStraight: -1,
            chance: -1,
            yahtzee: -1
        };
        this.totalScore = -1;
    }
    
    updateScore(category, score) {
        const scoreVals = this.scoreVals;
        
        if(scoreVals[category] === -1) { // Set the category's score if it hasn't already had its score set.
            scoreVals[category] = score;
            
            if(['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].includes(category)) { // If a top category is being updated
                if(scoreVals.totalNoBonus === -1) { // Set totalNoBonus to 0 if this is the first top category being updated.
                    scoreVals.totalNoBonus = 0;
                }
                
                // Add to totalNoBonus
                scoreVals.totalNoBonus += score;
                
                // Set bonus if all top categories are complete
                const allTopCategoriesComplete = scoreVals.ones >= 0 && scoreVals.twos >= 0 && scoreVals.threes >= 0 && scoreVals.fours >= 0 && scoreVals.fives >= 0 && scoreVals.sixes >= 0;
                if(scoreVals.bonus === -1 && allTopCategoriesComplete) {
                    scoreVals.bonus = scoreVals.totalNoBonus >= 63 ? 35 : 0;
                }
            }
            
            const scoresForTotal = [
                this.scoreVals.ones,
                this.scoreVals.twos,
                this.scoreVals.threes,
                this.scoreVals.fours,
                this.scoreVals.fives,
                this.scoreVals.sixes,
                this.scoreVals.bonus,
                this.scoreVals.threeOfAKind,
                this.scoreVals.fourOfAKind,
                this.scoreVals.fullHouse,
                this.scoreVals.smallStraight,
                this.scoreVals.largeStraight,
                this.scoreVals.chance,
                this.scoreVals.yahtzee
            ];
            
            // Update total score as you go. This way, if a player leaves in the middle of a game, their total score is still calculated.
            this.totalScore = 0;
            scoresForTotal.forEach(score => {
                if(score >= 0) {
                    this.totalScore += score;
                }
            });
            
            if(!(Object.values(scoreVals).indexOf(-1) > -1)) { // If all categories have a value > -1, meaning they have all been set.
                this.allCategoriesDone = true;
            }
        }
    }
    
    addYahtzeeBonus() {
        this.scoreVals.yahtzee += 100;
    }
}