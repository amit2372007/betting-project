const AviatorRound = require('../../model/aviator/aviator.js');
const { bustAviatorBets } = require('../aviator/settlementEngine.js'); // We will build this next!

class AviatorEngine {
    constructor(io) {
        this.io = io;
        this.state = {
            roundId: null,
            status: 'crashed', // 'starting', 'flying', 'crashed'
            multiplier: 1.00,
            timer: 0
        };
        this.crashPoint = 0;
        this.startTime = null;
        
        // Boot up the engine
        this.startNewRound();
    }

    // 1. Initialize a new betting window
    async startNewRound() {
        // FIXED ID GENERATION: Adds a random 4-digit number to prevent collisions
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        this.state.roundId = `AVI-${Date.now().toString().slice(-4)}${randomSuffix}`;
        
        this.state.status = 'starting';
        this.state.multiplier = 1.00;
        this.state.timer = 10; // 10 seconds to place bets

        // ==========================================
        // 🔥 SECURE CASINO MATH (3% House Edge)
        // ==========================================
        const MAX_MULTIPLIER = 100.00; // Protects the casino from bankruptcy

        // 3% chance to crash instantly at 1.00x (Casino eats all bets)
        if (Math.random() < 0.03) {
            this.crashPoint = 1.00;
        } else {
            // Standard Crash formula
            const h = Math.random(); 
            let calculatedCrash = (0.97 / (1 - h));
            
            // Hard Cap: Ensure it never drops below 1.01, and never exceeds 10,000x
            this.crashPoint = Math.min(MAX_MULTIPLIER, Math.max(1.01, calculatedCrash)); 
        }

        // Clean up the decimal to 2 places to match the UI perfectly
        this.crashPoint = Math.floor(this.crashPoint * 100) / 100;


        try {
            // Save the new round to MongoDB securely
            await AviatorRound.create({ 
                roundId: this.state.roundId, 
                status: 'starting' 
            });

            // START THE TIMER ONLY IF THE DATABASE INSERT SUCCEEDS
            const betPhase = setInterval(() => {
                this.state.timer--;
                this.io.emit('aviator_sync', this.state);

                if (this.state.timer <= 0) {
                    clearInterval(betPhase);
                    this.takeOff();
                }
            }, 1000);

        } catch (error) {
            // THE SAFETY NET
            if (error.code === 11000) {
                console.warn(`Collision on ${this.state.roundId}. Generating a new one...`);
                return this.startNewRound(); 
            } 
            
            console.error("Failed to start round due to DB error:", error);
        }
    }

    // 2. The Flight (Smooth Exponential Growth)
    takeOff() {
        this.state.status = 'flying';
        this.startTime = Date.now();

        // Update DB to lock out new bets
        AviatorRound.updateOne({ roundId: this.state.roundId }, { status: 'flying' }).exec();

        // Tick every 100ms for a smooth UI
        const flightLoop = setInterval(() => {
            const elapsedMs = Date.now() - this.startTime;
            
            // The magic formula: The longer it flies, the faster the multiplier grows
            const growthRate = 0.06; 
            const currentMultiplier = Math.pow(Math.E, growthRate * (elapsedMs / 1000));
            
            this.state.multiplier = currentMultiplier;

            // Did it hit the randomly generated limit?
            if (this.state.multiplier >= this.crashPoint) {
                clearInterval(flightLoop);
                this.crash(this.crashPoint);
            } else {
                // Broadcast live multiplier to all screens
                this.io.emit('aviator_sync', {
                    roundId: this.state.roundId,
                    status: 'flying',
                    multiplier: this.state.multiplier.toFixed(2)
                });
            }
        }, 100);
    }

    // 3. The Boom
    async crash(finalMultiplier) {
        this.state.status = 'crashed';
        this.state.multiplier = finalMultiplier;
        
        // Broadcast the explosion immediately
        this.io.emit('aviator_sync', {
            roundId: this.state.roundId,
            status: 'crashed',
            multiplier: finalMultiplier.toFixed(2)
        });

        // Update MongoDB
        await AviatorRound.updateOne(
            { roundId: this.state.roundId }, 
            { status: 'crashed', crashPoint: finalMultiplier, endTime: new Date() }
        );

        // 🔥 THE HOUSE WINS: Liquidate everyone who got greedy and didn't cash out!
        await bustAviatorBets(this.state.roundId);

        // Wait 5 seconds, then start all over again
        setTimeout(() => {
            this.startNewRound();
        }, 5000);
    }
}

module.exports = AviatorEngine;