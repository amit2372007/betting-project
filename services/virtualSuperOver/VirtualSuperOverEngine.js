const VirtualSuperOver = require('../../model/virtualSuperOver/VirtualSuperOver.js'); 
const { settleNextBallBets, settleMatchWinnerBets } = require('./settlementEngine.js');

class SuperOverEngine {
    constructor(io) {
        this.io = io;
        this.resetMatch();
        this.startEngine();
    }

    // 1. Initialize a fresh match in server memory (RAM)
    resetMatch() {
        // ---  AUTO-TOSS (4 Scenarios) ---
        const tossScenarios = [
            { winner: 'home', decision: 'bat', battingFirst: 'home' },
            { winner: 'home', decision: 'bowl', battingFirst: 'away' },
            { winner: 'away', decision: 'bat', battingFirst: 'away' },
            { winner: 'away', decision: 'bowl', battingFirst: 'home' }
        ];

        // Pick 1 of the 4 scenarios randomly
        const randomToss = tossScenarios[Math.floor(Math.random() * tossScenarios.length)];
        const battingSecond = randomToss.battingFirst === 'home' ? 'away' : 'home';

        this.state = {
            eventId: `VSO-${Date.now().toString().slice(-6)}`,
            homeTeam: "India", 
            awayTeam: "Pakistan",
            phase: 'toss', 
            timer: 15, 
            currentInnings: 1,
            battingTeam: randomToss.battingFirst,
            targetScore: null,
            innings1: { battingTeam: randomToss.battingFirst, runs: 0, wickets: 0, balls: 0, timeline: [] },
            innings2: { battingTeam: battingSecond, runs: 0, wickets: 0, balls: 0, timeline: [] },
            currentBallOutcome: null,
            toss: {
                winner: randomToss.winner,
                decision: randomToss.decision
            }
        };

        // 🔥 ADDED THIS: Initialize the odds for the very first ball!
        this.calculateMatchOdds();

        const tossWinnerName = randomToss.winner === 'home' ? this.state.homeTeam : this.state.awayTeam;
    }

    // 2. The Casino RNG (High-Action T20 Probabilities)
    generateBallOutcome() {
        const rand = Math.random() * 100;
        
        if (rand < 15) return { outcome: '0', runs: 0, legal: true }; 
        if (rand < 40) return { outcome: '1', runs: 1, legal: true }; 
        if (rand < 55) return { outcome: '2', runs: 2, legal: true }; 
        if (rand < 57) return { outcome: '3', runs: 3, legal: true }; 
        if (rand < 75) return { outcome: '4', runs: 4, legal: true }; 
        if (rand < 90) return { outcome: '6', runs: 6, legal: true }; 
        if (rand < 98) return { outcome: 'W', runs: 0, legal: true }; 
        
        return { outcome: 'wd', runs: 1, legal: false }; 
    }

    // 3. The Main Game Loop (Runs every 1 second)
    startEngine() {
        setInterval(async () => {
            this.state.timer--;
            this.io.emit('vso_sync', this.state);

            if (this.state.timer <= 0) {
                await this.handlePhaseTransition();
            }
        }, 1000);
    }

    // 4. State Machine Logic
    async handlePhaseTransition() {
        const currentInningsData = this.state.currentInnings === 1 ? this.state.innings1 : this.state.innings2;

        switch (this.state.phase) {
            
            case 'toss':
            case 'break':
                this.state.phase = 'betting';
                this.state.timer = 10; 
                this.io.emit('vso_event', { message: 'Betting is OPEN!' });
                break;

            case 'betting':
                this.state.phase = 'delivery';
                this.state.timer = 5; 
                
                const result = this.generateBallOutcome();
                this.state.currentBallOutcome = result;
                
                currentInningsData.runs += result.runs;
                
                if (result.outcome === 'W') {
                    currentInningsData.wickets += 1;
                }
                
                if (result.legal) {
                    currentInningsData.balls += 1;
                }
                
                currentInningsData.timeline.push({
                    ballNumber: currentInningsData.balls,
                    outcome: result.outcome,
                    runsAdded: result.runs,
                    isLegal: result.legal
                });
                
                // 🔥 ADDED THIS: Recalculate the match odds based on the new runs/wickets!
                this.calculateMatchOdds();

                this.io.emit('vso_delivery', result);
                settleNextBallBets(this.state.eventId, result);

                break;

            case 'delivery':
                const isAllOut = currentInningsData.wickets >= 2;
                const isOverComplete = currentInningsData.balls >= 6;
                const isTargetChased = this.state.targetScore && currentInningsData.runs >= this.state.targetScore;

                if (isAllOut || isOverComplete || isTargetChased) {
                    if (this.state.currentInnings === 1) {
                        this.state.targetScore = this.state.innings1.runs + 1;
                        this.state.phase = 'break';
                        this.state.timer = 15;
                        this.state.currentInnings = 2;
                        this.state.battingTeam = this.state.battingTeam === 'home' ? 'away' : 'home';
                        this.io.emit('vso_event', { message: `Innings Break! Target is ${this.state.targetScore}` });
                    } else {
                        this.state.phase = 'match_end';
                        this.state.timer = 10;
                        this.io.emit('vso_event', { message: 'Match Completed!' });
                        await this.saveMatchToDatabase(); 
                    }
                } else {
                    this.state.phase = 'betting';
                    this.state.timer = 10;
                    this.io.emit('vso_event', { message: 'Betting is OPEN!' });
                }
                break;

            case 'match_end':
                this.resetMatch();
                break;
        }
    }

    // 5. Save Final Stats to MongoDB
    async saveMatchToDatabase() {
        try {
            const i1Runs = this.state.innings1.runs;
            const i2Runs = this.state.innings2.runs;
            const i1BattingTeam = this.state.innings1.battingTeam; 
            const i2BattingTeam = this.state.innings2.battingTeam; 
            
            let finalWinner = null;
            let finalMargin = null;

            if (i1Runs > i2Runs) {
                finalWinner = i1BattingTeam;
                finalMargin = `${this.state[i1BattingTeam + 'Team']} won by ${i1Runs - i2Runs} runs`;
            } else if (i2Runs > i1Runs) {
                finalWinner = i2BattingTeam;
                const wicketsRemaining = 2 - this.state.innings2.wickets;
                finalMargin = `${this.state[i2BattingTeam + 'Team']} won by ${wicketsRemaining} wickets`;
            } else {
                finalWinner = 'tie';
                finalMargin = 'Match Tied';
            }

            await VirtualSuperOver.create({
                eventId: this.state.eventId,
                homeTeam: this.state.homeTeam,
                awayTeam: this.state.awayTeam,
                status: 'completed',
                toss: {
                    winner: this.state.toss.winner,
                    decision: this.state.toss.decision
                },
                result: {
                    winner: finalWinner,
                    margin: finalMargin
                },
                innings1: {
                    battingTeam: this.state.innings1.battingTeam,
                    totalRuns: this.state.innings1.runs,
                    totalWickets: this.state.innings1.wickets,
                    legalBallsBowled: this.state.innings1.balls,
                    timeline: this.state.innings1.timeline
                },
                innings2: {
                    battingTeam: this.state.innings2.battingTeam,
                    totalRuns: this.state.innings2.runs,
                    totalWickets: this.state.innings2.wickets,
                    legalBallsBowled: this.state.innings2.balls,
                    timeline: this.state.innings2.timeline
                },
                completedAt: new Date()
            });
            console.log(`💾 Match ${this.state.eventId} saved. Result: ${finalMargin}`);

            // 🔥 FIXED: finalWinner is already 'home', 'away', or 'tie'. Just pass it directly!
            this.io.emit('vso_match_result', { winner: finalWinner });
            
            settleMatchWinnerBets(this.state.eventId, finalWinner);
        } catch (err) {
            console.error("Failed to save Virtual Match to DB:", err);
        }
    }

    // --- PROFESSIONAL DYNAMIC ODDS ALGORITHM ---
    calculateMatchOdds() {
        let homeProb = 0.50; // Start at 50/50

        // The Sigmoid Function: Converts any advantage index into a smooth 0.0 to 1.0 probability
        const sigmoid = (z) => 1 / (1 + Math.exp(-z));

        if (this.state.currentInnings === 1) {
            const inn = this.state.innings1;
            const parScore = 12; // Standard Super Over par score
            const ballsLeft = 6 - inn.balls;

            // In a Super Over, 1 wicket is devastating. If they lose 1, expected scoring drops by 40%.
            const wicketPenalty = inn.wickets === 1 ? 0.60 : 1.0; 
            const expectedRunRate = 1.9; // Standard aggressive runs per ball
            
            // Calculate how many runs they are projected to finish with
            const projectedScore = inn.runs + (ballsLeft * expectedRunRate * wicketPenalty);
            
            // Calculate Z-Score (Advantage Index). 
            // 0.3 is the variance weight. Higher number = steeper odds shifts.
            const zScore = (projectedScore - parScore) * 0.3; 

            let battingProb = sigmoid(zScore);

            // Assign probability to the correct team
            if (this.state.battingTeam === 'home') {
                homeProb = battingProb;
            } else {
                homeProb = 1 - battingProb; // Away is batting, so Home is bowling
            }

        } else {
            // 2ND INNINGS: The Chase
            const inn = this.state.innings2;
            const runsNeeded = this.state.targetScore - inn.runs;
            const ballsLeft = 6 - inn.balls;

            // Absolute End Conditions
            if (runsNeeded <= 0) {
                homeProb = this.state.battingTeam === 'home' ? 0.999 : 0.001;
            } else if (inn.wickets >= 2 || ballsLeft <= 0) {
                homeProb = this.state.battingTeam === 'home' ? 0.001 : 0.999;
            } else {
                // If 1 wicket down in a chase, pressure increases immensely. Scoring potential drops by 45%.
                const wicketPenalty = inn.wickets === 1 ? 0.55 : 1.0; 
                
                // How many runs can they realistically score from here?
                const expectedRunsRemaining = ballsLeft * 1.9 * wicketPenalty;

                // Z-Score: Expected Runs vs Runs Actually Needed
                // Weight is increased to 0.45 because late-game has less variance and higher certainty
                const zScore = (expectedRunsRemaining - runsNeeded) * 0.45;

                let chasingProb = sigmoid(zScore);

                homeProb = this.state.battingTeam === 'home' ? chasingProb : (1 - chasingProb);
            }
        }

        // Cap probabilities at 95% and 5% to prevent offering 1.00x odds or throwing errors
        homeProb = Math.max(0.05, Math.min(0.95, homeProb));
        let awayProb = 1 - homeProb;

        // Apply House Edge (Overround) - 7% Margin guarantees platform profitability
        const houseMargin = 1.07; 
        
        let homeOdds = (1 / (homeProb * houseMargin)).toFixed(2);
        let awayOdds = (1 / (awayProb * houseMargin)).toFixed(2);

        // Broadcast to state
        this.state.matchOdds = {
            home: parseFloat(homeOdds),
            away: parseFloat(awayOdds)
        };
    }
}

module.exports = SuperOverEngine;