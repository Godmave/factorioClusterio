const fs = require("fs");

class trainTeleporter{
	constructor({socket, instanceID, master}){
		this.socket = socket;
		this.instanceID = instanceID;
		this.master = master;
		
		this.lastSeen = Date.now();
		
		(async () => {
			setInterval(async () => {
				this.socket.emit("trainstopsDatabase", await this.master.getTrainstops());
			}, 10000);
			this.socket.on("getTrainstops", async () => {
				this.lastSeen = Date.now();
				this.socket.emit("trainstopsDatabase", await this.master.getTrainstops());
			});
			this.socket.on("trainstop_added", async data => {
				this.lastSeen = Date.now();
				await this.addTrainstop(data);
				console.log("trainstop_added: "+data.name);
			});
			this.socket.on("trainstop_edited", async data => {
				this.lastSeen = Date.now();
				await this.removeTrainstop({
					x:data.x,
					y:data.y,
					name:data.oldName
				});
				await this.addTrainstop(data);
				console.log("trainstop_edited: "+data.name);
			});
			this.socket.on("trainstop_removed", async data => {
				this.lastSeen = Date.now();
				await this.removeTrainstop(data);
				console.log("trainstop_removed: "+data.name);
			});
		})();
	}
	async addTrainstop({x, y, name}){
		let trainstops = await this.master.getTrainstops();
		if(!trainstops[this.instanceID]) trainstops[this.instanceID] = {};
		if(!trainstops[this.instanceID][name]) trainstops[this.instanceID][name] = {name, stops:[]};
		trainstops[this.instanceID][name].stops.push({x,y});
		
		await this.master.saveTrainstops();
		return true;
	}
	async removeTrainstop({x, y, name}){
		let trainstops = await this.master.getTrainstops();
		if(!trainstops[this.instanceID][name]){
			return true;
		} else {
			trainstops[this.instanceID][name].stops.forEach((trainstop, index) => {
				if(trainstop.x == x && trainstop.y == y){
					trainstops[this.instanceID][name].stops.splice(index, 1);
				}
			});
			if(!trainstops[this.instanceID][name].stops[0]) delete trainstops[this.instanceID][name];
			await this.master.saveTrainstops();
			return true;
		}
	}
}

class masterPlugin {
	constructor({config, pluginConfig, path, socketio, express}){
		this.config = config;
		this.pluginConfig = pluginConfig;
		this.pluginPath = path;
		this.io = socketio;
		this.express = express;
		
		this.clients = {};
		this.io.on("connection", socket => {
			for(let id in this.clients){
				if(Date.now() - this.clients[id].lastSeen > 60000){
					delete this.clients[id];
				}
			}
			socket.on("registerTrainTeleporter", data => {
				console.log("Registered train teleporter "+data.instanceID);
				this.clients[data.instanceID] = new trainTeleporter({
					master:this,
					instanceID: data.instanceID,
					socket,
				});
			});
		});
		
		this.express.get("/api/trainTeleports/getTrainstops", async (req,res) => {
			res.send(await this.getTrainstops());
		});
	}
	getTrainstops(){
		return new Promise((resolve, reject) => {
			if(this.trainstopsDatabase){
				console.log(this.trainstopsDatabase)
				resolve(this.trainstopsDatabase);
			} else {
				fs.readFile("database/trainstopsDatabase.json", (err, data) => {
					if(err){
						this.trainstopsDatabase = {};
						resolve(this.trainstopsDatabase);
					} else {
						this.trainstopsDatabase = JSON.parse(data);
						resolve(this.trainstopsDatabase);
					}
				});
			}
		});
	}
	saveTrainstops(){
		return new Promise((resolve, reject) => {
			if(this.trainstopsDatabase){
				console.log(this.trainstopsDatabase)
				fs.writeFile("database/trainstopsDatabase.json", JSON.stringify(this.trainstopsDatabase, null, 4), (err, data) => {
					if(err){
						reject(err);
					} else {
						resolve("Database successfully saved");
					}
				});
			} else {
				resolve("Nothing to save");
			}
		});
	}
}
module.exports = masterPlugin;