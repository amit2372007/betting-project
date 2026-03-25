const User = require("../model/user/user.js");
const AviatorRound = require("../model/aviator/aviator.js");


module.exports.renderFruitBonanza = async (req, res) => {
    try{
        res.render("./casino/fruitBonanza.ejs", {user: req.user});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
     }  
};

module.exports.render7Up7Down = async (req, res) => {
    try{
         res.render("./casino/7Up7Down.ejs", {user: req.user});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
     }
    
};

module.exports.renderVirtualSuperOver = (req, res) => {
    try{
         res.render("./casino/virtualSuperOver.ejs", {user: req.user}); 
    } catch (err) {
        req.flash("error", "An error occurred while loading the page.");
        return res.redirect("/home");
    }
};

module.exports.renderAviator = async (req, res) => {
    try {
        const freshUser = await User.findById(req.user._id);

        const recentHistory = await AviatorRound.find({ status: 'crashed' })
            .sort({ createdAt: -1 }) // Newest first
            .limit(10)
            .select('crashPoint')
            .lean();

        res.render("./casino/aviator.ejs", { 
          user: freshUser ,
          history: recentHistory 
        });
    } catch (err) {
        console.error("Error loading Aviator:", err);
        res.redirect('/home');
    }
};

module.exports.renderDiamondMines = async (req, res) => {
  try{
     res.render("./includes/casino/diamondMines.ejs");
  } catch (err) {
    req.flash("error", "An error occurred while loading the page.");
    return res.redirect("/home");
  }
}; 

module.exports.renderChickenRoad = async (req, res) => {
    try {
        res.render("./casino/chickenRoad.ejs", { user: req.user });
    } catch (err) {
        req.flash("error", "Error loading Chicken Road");
        res.redirect("/home");
    }
};

