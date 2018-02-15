// Copyright (c) Martin McCarthy 2017,2018
// version 0.4.1
// Chrome Browser Script
//
// Make some tweaks to (potentially) improve the iStock contributor pages on gettyimages.com.
//
// v0.0.1 06 Feb 2017 Martin McCarthy
//        First version
// v0.1.0 07 Feb 2017 Martin McCarthy
//		  First public version
// v0.1.1 08 Feb 2017 Martin McCarthy
//		  Don't show media if DLs are zero
// v0.1.2 09 Feb 2017 Martin McCarthy
//		  Track changes in DLs
// v0.1.4 10 Feb 2017 Martin McCarthy
//		  Track recent history of DLs over weeks
// v0.1.5 10 Feb 2017 Martin McCarthy
//		  CSS changes for the history box
// v0.1.6 13 Feb 2017 Martin McCarthy
//		  More CSS tweaks
// v0.1.7 16 Feb 2017
//		  Cope with multiple pages of batches
// v0.1.8 19 Feb 2017
//		  Show batch breakdown when mouseover the ESP link
// v0.2.0 19 Feb 2017
//		  Report on Sig+ nominations and acceptances
// v0.2.1 21 Feb 2017
//		  Alert when there are unread messages
//		  Readability tweaks to the batch pop-up
// v0.2.2 14 Mar 2017
//		  Report on rejections
// v0.2.3 17 May 2017
//		  Report on Sig+ nominations for revised files
// v0.2.4 23 Jun 2017
//		  Show YTD values in the title
// v0.2.5 24 Jun 2017
//        Include update time in the title
// v0.2.6 30 Jun 2017
//        In the title, '*' indicates new DLs in the last update, '+' new DLs since the last page refresh.
// v0.2.7 05 Dec 2017
//		  Up to 6 months or 20 entries for batch data
// v0.2.8 09 Dec 2017
//        Throttle back to 2 months
//        Sanity check that we don't go back more than 5 pages
//        Add an identifier to any URLs
// v0.2.9 10 Dec 2017
//        Back up to 3 months for batch data
//        Move the ESP/YTD pop-ups down the screen slightly
// v0.3.4 04 Jan 2018
//		  Track 30-day Views & Interactions
//		  Better positioning of the DL History pop-up
//		  Colour views/interactions to indicate rise/fall
// v0.3.9 12 Jan 2018
//        Calculate 7-day medians of the views/interactions for a hopefully more meningful trend
//        Calculate the trending views/interactions per day
//		  Report on DL targets for exclusives
// v0.3.12 13 Jan 2018
//		  Typos in the trend changes
// v0.3.13 20 Jan 2018
//		  Log trend array errors
// v0.3.14 21 Jan 2018
//		  Log history array errors
// v0.3.15 23 Jan 2018
//		  Forget the whole Views/Interactions trend nonsense
// v0.3.16 25 Jan 2018
//		  Fixes for Account Management authorisation changes
// v0.3.19 25 Jan 2018
//		  Show DLs per "day"
// v0.4.0 14 Feb 2018
//		  Views/Interactions are back
// v0.4.1 15 Feb 2018
//		  Graphs of daily(ish) downloads
// 
//
'use strict';

const scriptID="plugin=theasis-chrome-getty-toolbar-0.4.1";
var currentDLs={};
var targetDetailsHtml="";
var dlRates=[25,30,35,40,45];
var dlTargets={
	Photo:[0,550,5500,22000,330000],
	Illustration:[0,0,4400,16500,110000],
	Video:[0,200,1200,2750,22000]
}
var updateInterval = 10 * 60 * 1000; // every 10 minutes
var recentActivityUpdateInterval = 1 * 3600 * 1000; // every 1 hour
var batchHistory={};
var recentActivityHistory={lastChecked:0,views:{total:0},interactions:{total:0},history:[]};
const espStatsUrl="https://esp.gettyimages.com/ui/statistics/recent_activity?size=0&"+scriptID;
const dlsUrl="https://accountmanagement.gettyimages.com/Account/Profile?"+scriptID;
const statsUrl="https://esp.gettyimages.com/ui/statistics/recent_activity?size=0&"+scriptID;
var dlsLoginSanityCheck=0;

// Views & Interactions
var lastChecked=0;
var views=0;
var interactions=0;
var storedHistory={};
var currentTrend=null;
var lastTrend=null;

// sync storage objects are keyed on the string "MM-DD", so there can be up to 366 values saved
// object contains e.g.: { date:20180211, views:1234, interactions:123 }
// so it's necessary to check 'date' to ensure that any history is actually recent history
class ViewInt {
	constructor(views,interactions,date) {
		this.name="ViewInt";
		this.views=views;
		this.interactions=interactions;
		this.date=date||yyyymmdd();
	}

	key() {
		return this.date.slice(4,6)+"-"+this.date.slice(6);
	}

	toStorage() {
		return 	{
					'date':this.date,
					'views':this.views,
					'interactions':this.interactions
				};
	}
}

function main() {

	var lastUpdated = function() {
		return "\nLast updated: "+new Date().toTimeString();
	};
	
	var setCss = function() {
		jQ('head').append("<style type='text/css'>div.theasis_popupSummary { font-family:proxima-nova, Helvetica Neue, Arial, sans serif; font-size: 120%; position:absolute; display:none; top:30px; right:100px; background-color:#dde0e0; color:#333333; padding:2ex; opacity:0.95; border-radius: 3px; box-shadow: 1px 0px 3px 3px #666; z-index:10000; } #theasis_batchesTable td { padding:1ex; color:#fff; text-align:right; } #theasis_batchesTable th { padding:0.5ex; color:#000; background-color:#ccc; } #theasis_batchesTable td.theasis_batchName { background-color:#333; text-align:left; } td.theasis_batchCount { background-color:#555; } td.theasis_batchSubs { background-color:#1aabec; } td.theasis_batchReviewed { background-color:#53c04c; } td.theasis_batchWaiting { background-color:#c09b4c; } td.theasis_batchRevisable { background-color:#c0534c; } #theasis_batchesTable span.theasis_batchUpdatedLabel { font-size:90%; color: #aaa; } span.theasis_batchUpdated { font-style:italic; font-size:80%; color: #8ac; } span.theasis_batchSplus { font-style: italic; color: #235; } span.theasis_batchReject { font-style: italic; color: #532; } #theasis_messagesLink { color:#fc3; } #theasis_recentActivityTable td { color:#000; text-align:right; } </style>");
	};
	
	var dlsPageLoaded = function(data,textStatus,jqXHR) {
		const html=jQ(data);
		const d=html.find("h3").eq(1);
		const now=Date.now();
		const year=new Date().getUTCFullYear();
		const year_start=Date.UTC(year,0,1);
		const day_of_year=Math.floor((now - year_start)/(1000*60*60*24))+1;
		let t="";
		let title="";
		let media=false;
		let targetDetails={};

		const pageLoadedValidation=html.find("form[action='/Account/Profile']").length;
		if (pageLoadedValidation<1) {
			const accLink=jQ("#theasis_accountLink").attr("href");
			if (dlsLoginSanityCheck++<3) {
				jQ.ajax({
					url:"/ui/account_manager?path=Account/Profile",
					crossDomain:true,
					statusCode: {
						401: dlsAuthFail
					}
				}).done(function(){
					jQ.ajax({
						url:dlsUrl,
						crossDomain:true,
						statusCode: {
							401: dlsAuthFail
						}
					}).done(function(d,t,j){
						dlsPageLoaded(d,t,j);
					});
				});
			} else {
				//dlsLoginSanityCheck=0;
				return;
			}
		}

		//dlsLoginSanityCheck=0;

		const tr=d.next().find("tr:gt(0)");
		tr.each(function(i){
			media=true;
			const l=jQ(this).find("td:first").text().trim();
			const excl=jQ(this).find("td:eq(2)").text().trim();
			const v=jQ(this).find("td:eq(3)").text().trim();
			const rrate=jQ(this).find("td:eq(4)").text().trim();
			let changed=false;
			if (v>0 && currentDLs[l]==null) {
				currentDLs[l] = {current:0, changed:false, history:""};
			}
			if (v>0 && currentDLs[l].current>0 && currentDLs[l].current!=v) {
				changed=true;
				currentDLs[l].changed=true;
				const now = new Date();
				currentDLs[l].history=""+currentDLs[l].current+"&#8594;"+v+" "+now.toTimeString()+"\n"+currentDLs[l].history;
			}
			if (v>0) {
				if (!excl.includes("Non")) {
					// console.log(l + " Exclusive");
					let currentRate=0
					for(let i=1;i<dlRates.length;++i) {
						if (dlTargets[l][i]>v) {
							break;
						}
						currentRate=i;
					}
					targetDetails[l] = "<br>Current " + l + " royalty rate: " + rrate;
					targetDetails[l] += "<br>" + (year+1) + " " + l + " royalty rate: " + dlRates[currentRate] + "%";
					if (currentRate<dlRates.length-1) {
						const dlsToNextTarget = dlTargets[l][currentRate+1]-v;
						const dlsPerDay=v/day_of_year;
						const daysToGo=Math.ceil(dlsToNextTarget/dlsPerDay);
						targetDetails[l] += "<br>Next royalty level at " + dlTargets[l][currentRate+1] + " (" + dlsToNextTarget + " to go)." +
							"<br>That will take " + daysToGo + " days at "+Math.round(dlsPerDay)+" DLs per day.<br>";
					}
					// console.log(targetDetails[l]);
				}
				currentDLs[l].current=v;
				t = t + l.substring(0,1) + ":<span style='" + (changed ? "color:#44ee44" : (currentDLs[l].changed ? "color:#66aa44" : "color:#eeeeee")) +"' title='"+v+" "+l+" downloads this year"+lastUpdated()+"\n"+currentDLs[l].history+"'>" + v + "</span> ";
				title = title + l.substring(0,1) + ":" + (changed ? "*" : (currentDLs[l].changed ? "+" : "")) + v + " ";
			}
		});
		if (media && t.length==0) {
			t=" 0 :-( ";
		}
		targetDetailsHtml="";
		jQ.each(targetDetails, function(i){ targetDetailsHtml += targetDetails[i]+"<br>"; });
		if (jQ("#theasis_dlTargetInfo").length>0) {
			jQ("#theasis_dlTargetInfo").html(targetDetailsHtml);
		}
		jQ("#theasis_DLCount").html(t);
		jQ("head title").text(title+lastUpdated());
		let storedDLs={};
		for (const k in currentDLs) {
			if (currentDLs[k]!=null && currentDLs[k].current>0) {
				storedDLs[k]=currentDLs[k].current;
			}
		}
		let storedObject={};
		storedObject[shortDateStr()]=storedDLs;
		try {
			chrome.storage.sync.set(storedObject,
				function(){
					// console.log("saved DLs to sync storage");
				});
		} catch(err) {
			console.log("sync.set failed: " + err);
		}
		window.setTimeout(updateCount, updateInterval);
	};
	
	var stats={};
	var page=1;	
	var then;
	var nowish;
	var batchIds;
	var espDataLoaded = function(data) {
		if (page == 1) {
			stats = {
				batches:data.meta.total_items,
				shownBatches:0,
				countedBatches:0,
				contribs:0,
				awaitingReview:0,
				reviewed:0,
				revisable:0,
				submitted:0
			};
			batchIds=[];
			jQ("#theasis_batchPopup").html("<table id='theasis_batchesTable'><tbody><tr><th>Batch Name</th><th>Files</th><th>Sub'd</th><th>Rev'd</th><th>Wait</th><th>Revise</th></tr></tbody></table>");
		}
		stats.shownBatches += data.items.length;
		stats.countedBatches += data.items.length;
		for (const item of data.items) {
			if (item.status=="closed") {
				stats.shownBatches--;
				// console.log("closed batch");
				continue;
			}
			stats.contribs += item.contributions_count;
			stats.awaitingReview += item.contributions_awaiting_review_count;
			stats.reviewed += item.reviewed_contributions_count;
			stats.revisable += item.revisable_contributions_count;
			stats.submitted += item.submitted_contributions_count;
			batchIds.push({id:item.id,updated:item.last_submitted_at});
			const updated = new Date(item.updated_at);
			const html =
						"<tr id='theasis_batchRow"+item.id+"'><td class='theasis_batchName'>"+item.submission_name+"<br><span class='theasis_batchUpdatedLabel'>Updated: </span><span class='theasis_batchUpdated'>"+updated.toLocaleString()+"</span>"+
						"</td><td class='theasis_batchCount'>"+item.contributions_count+
						"</td><td class='theasis_batchSubs'>"+item.submitted_contributions_count+
						"</td><td class='theasis_batchReviewed'>"+item.reviewed_contributions_count+
						"</td><td class='theasis_batchWaiting'>"+item.contributions_awaiting_review_count+
						"</td><td class='theasis_batchRevisable'>"+item.revisable_contributions_count+"</td></tr>";
			jQ("#theasis_batchesTable tbody").append(html);
		}
		addEspToToolbar(stats);
		if (stats.countedBatches<stats.batches && page<5) {
			page += 1;
			doDls();
		} else {
			checkForSplus(batchIds);
		}
	};
	
	var checkForSplus = function(batchIds) {
		for (let bidObj of batchIds) {
			getBatch(bidObj);
		}
	};
	
	var getBatch = function(bidObj) {
		if (!batchHistory[bidObj.id] || batchHistory[bidObj.id].updated!=bidObj.updated) {
			jQ.ajax({
				url:"https://esp.gettyimages.com/api/submission/v1/submission_batches/"+bidObj.id+"/contributions?page=1&pages_size=200&"+scriptID
			}).done(function(data){batchRead(data,bidObj)});
		} else {
			showSplus(bidObj.id,batchHistory[bidObj.id]['processed'],batchHistory[bidObj.id]['review']);

		}
	};
	
	var batchRead = function(batchData,bidObj) {
		let batch={updated:bidObj.updated};
		let bid = bidObj.id;
		let batchStatus = bidObj.status;
		for (let img of batchData) {
			let file=img.file_name;
			let splus=img.nominate_for_signature_plus;
			let collection=img.collection_cfw_name; // "Signature"
			let status=img.status; // "processed" | "review" | "revised"
			if (status=="rejected" || splus) {
				if (!batch[status]) {
					batch[status]=0;
				}
				++batch[status];
			}
		}
		showSplus(bid,batch['processed'],batch['review']+batch['revised']);
		showRejects(bid,batch['rejected']);
		batchHistory[bid] = batch;
		chrome.storage.local.set({'batchHistory':batchHistory});
	};
	
	var showSplus = function(bid,accepted,nominated) {
		if (accepted>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchReviewed').append('<br><span class="theasis_batchSplus">('+accepted+' S+)</span>');
		}
		if (nominated>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchWaiting').append('<br><span class="theasis_batchSplus">('+nominated+' S+)</span>');
		}
	};

	var showRejects = function(bid,rejected) {
		if (rejected>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchReviewed').append('<br><span class="theasis_batchReject">('+rejected+' Rej)</span>');
		}
	}
	
	var updateHistory = function(items) {
		const div=jQ("#theasis_historyPopup");
		const oneDay=1000*3600*24;
		let date=Date.now()-13*oneDay;
		let html="<div id='theasis_dlTargetInfo'>"+targetDetailsHtml+"</div><table>";
		let rowsHtml="";
		let previousTotal={Photo:null,Illustration:null,Video:null};
		let dailyData={Label:[],Photo:[],Illustration:[],Video:[]};
		for (let i=0;i<14;++i) {
			const key = shortDateStr(new Date(date));
			if (items[key]) {
				let rowHtml = "<tr><td><i>"+key+"</i></td>";
				dailyData.Label[i]=key.slice(-2);
				for (let l in items[key]) {
					let dayDls = "";
					let diff=items[key][l]-previousTotal[l];
					dayDls=" ["+diff+"]";
					if (previousTotal[l]===null) {
						dayDls="";
					} else {
						dailyData[l][i]=diff;
					}
					previousTotal[l]=items[key][l];
					rowHtml += "<td><span style='padding-left:1em;'>"+l+": <b>"+items[key][l]+dayDls+"</b></span></td>";
				}
				rowHtml += "</tr>";

				rowsHtml = rowHtml + rowsHtml;
			}
			date += oneDay;
		}
		html += rowsHtml + "</table>";
		div.html(html);

		html += "<div class='ct-chart' id='PhotoChart' style='background:#dff;'><div style='text-align:center; font-weight:bold; padding-top:8px;'><span style='color:rgb(215, 2, 6);'>Photos</span></div></div>";
		html += "<div class='ct-chart' id='IllustrationChart' style='background:#dff;'><div style='text-align:center; font-weight:bold; padding-top:8px; margin-top:2px;'><span style='color:rgb(215, 2, 6);'>Illustrations</span></div></div>";
		html += "<div class='ct-chart' id='VideoChart' style='background:#dff;'><div style='text-align:center; font-weight:bold; padding-top:8px; margin-top:2px;'><span style='color:rgb(215, 2, 6);'>Videos</span></div></div>";
		div.html(html);

		let chartOptions={
			width:""+Math.max(dailyData.Label.length*20,200)+"px",
			height:"120px"
		};

		if (previousTotal.Photo===null || previousTotal.Photo===0) {
			jQ("#PhotoChart").css({display:"none"});
		} else {
			new Chartist.Line('#PhotoChart',
			{
				labels: dailyData.Label,
				series: [dailyData.Photo]
			}, chartOptions);
		}
		if (previousTotal.Illustration===null || previousTotal.Illustration===0) {
			jQ("#IllustrationChart").css({display:"none"});
		} else {
			new Chartist.Line('#IllustrationChart',
			{
				labels: dailyData.Label,
				series: [dailyData.Illustration]
			}, chartOptions);
		}
		if (previousTotal.Video===null || previousTotal.Video===0) {
			jQ("#VideoChart").css({display:"none"});
		} else {
			new Chartist.Line('#VideoChart',
			{
				labels: dailyData.Label,
				series: [dailyData.Video]
			}, chartOptions);
		}
	};
	
	var showDlHistory = function() {
		const popup = jQ("#theasis_historyPopup");
		const trigger=jQ("#theasis_accountLink").parent();
		const position=trigger.position();
		popup.css({left:""+(position.left-50)+"px",top:""+(position.top+trigger.height()+8)+"px",right:"auto"}).show(100);

		chrome.storage.sync.get(null,updateHistory);
	};
	
	var hideDlHistory = function() {
		jQ("#theasis_historyPopup").hide(300);
	};
	
	var showBatches = function() {
		const trigger=jQ("#theasis_espLink").parent();
		const popup=jQ("#theasis_batchPopup");
		const position=trigger.position();
		// console.log("position: " + (position.left+trigger.width()) + " " + (position.top+trigger.height()-2));
		popup.css({left:""+(position.left-100)+"px",top:""+(position.top+trigger.height()+8)+"px",right:"auto"}).show(100);
	};
	
	var hideBatches = function() {
		if (!jQ("#theasis_batchPopup").is(":hover") && !jQ("#theasis_espLink").parent().is(":hover")) {
			jQ("#theasis_batchPopup").hide(300);
		}
	};	

	var addCountToToolbar = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href").replace("http:","https:");
		jQ("body").css({position:"relative"}).append("<div id='theasis_historyPopup' class='theasis_popupSummary'>History</div>");
		jQ("body").append("<div id='theasis_batchPopup' class='theasis_popupSummary'>Batches</div>");
		jQ('#theasis_batchPopup').hover(
			showBatches,
			hideBatches
			);
		accountLi.replaceWith( "<li><a id='theasis_accountLink' href='"+accountUrl+"'><span style='color:#888888'>DLs: </span><span id='theasis_DLCount' style='color:#cccccc'></span></a></li>" );
		jQ('#theasis_accountLink span:first').hover(
			showDlHistory,
			hideDlHistory
			);
		jQ("body").append("<div id='theasis_viewsStatsPopup' class='theasis_popupSummary'>Views/Interactions History</div>");
		updateCount();
	};
	
	var addMessagesToToolbar = function() {
		jQ("#theasis_accountLink").parent().after("<li><a id='theasis_messagesLink' href='https://accountmanagement.gettyimages.com/Messages/Messages'></a></li>");
	};

	var addRecentActivityToToolbar = function() {
		jQ("#theasis_accountLink").parent().after("<li><a id='theasis_recentActivityLink' href='https://esp.gettyimages.com/app/stats'></a></li>");
	};
	
	var dlsAuthFail = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href");
		accountLi.replaceWith( "<li><a href='"+accountUrl+"'>Account log in</a></li>" );
		updateCount();
	};
	
	var addEspToToolbar = function(stats) {
		const when=lastUpdated();
		const espLi = jQ("nav.micro ul:first li:first");
		const espUrl = espLi.find("a:first").attr("href");
		let html = "<li><a id='theasis_espLink' href='"+espUrl+"'>ESP: <span title='Data for "+stats.shownBatches+" of "+stats.batches+" batches"+when+"'>("+stats.shownBatches+"/"+stats.batches+")</span> <span id='theasis_esp_uploaded' style='color:#888888' title='"+stats.contribs+" uploaded"+when+"'>"+stats.contribs+"</span> <span id='theasis_esp_submitted' style='color:#1aabec' title='"+stats.submitted+" submitted"+when+"'>"+stats.submitted+"</span> <span id='theasis_esp_reviewed' style='color:#53c04c' title='"+stats.reviewed+" reviewed"+when+"'>"+stats.reviewed+"</span> <span id='theasis_esp_waiting' style='color:#c09b4c' title='"+stats.awaitingReview+" awaiting review"+when+"'>"+stats.awaitingReview+"</span> <span id='theasis_esp_revisable' style='color:#c0534c' title='"+stats.revisable+" revisable"+when+"'>"+stats.revisable+"</span></a></li>";
		espLi.replaceWith( html );
		jQ('#theasis_espLink').parent().hover(
			showBatches,
			hideBatches
			);
	};
	
	var espAuthFail = function() {
		const espLi = jQ("nav.micro ul:first li:first");
		const espUrl = espLi.find("a:first").attr("href");
		let html = "<li><a href='"+espUrl+"'>ESP: log in</a></li>";
		espLi.replaceWith( html );
	}
	
	var addForumToToolbar = function() {
			jQ("nav.micro ul:first").append( "<li><a href='https://contributors.gettyimages.com/forum/'><span>Forum</span></a></li>" );
	};
	
	var shortDateStr = function(d) {
		let date = d ? d : new Date();
		return dateStr(date).substr(5);
	};
	
	var doDls = function() {
		jQ.ajax({
			url:"https://esp.gettyimages.com/api/submission/v1/submission_batches?date_from="+dateStr(then)+"&date_to="+dateStr(nowish)+"&page="+page+"&page_size=20&sort_column=created_at&sort_order=DESC&"+scriptID,
			statusCode: {
				401: espAuthFail
			}
		}).done(espDataLoaded);
	};
	
	var updateCount = function() {
		const d = new Date();
		then = new Date(Date.now() - (1000*3600*24*7*13)); // 13 weeks ago
		nowish = new Date(Date.now() + (1000*3600*24)); // tomorrow
		jQ.ajax({
			url:dlsUrl,
			statusCode: {
				401: dlsAuthFail
			}
		}).done(dlsPageLoaded);
		page=1;
		doDls();
		doStats();
		updateMessageCount();
	};

	var doStats = function() {
		const now = Date.now();
		// always make sure we're up-to-date if we're looking at the actual stats page
		if (window.location.pathname.startsWith("/app/stats") || now > lastChecked+updateInterval) {
			lastChecked=now;
			jQ.ajax({
				url:statsUrl // scriptID is included already!
			}).done(statsLoaded);
		}
		showStats();
	};

	var statsLoaded = function(data) {
		const now = Date.now();
		if (data) {
			if (data['total_interactions']) {
				interactions = data['total_interactions'];
			}
			if (data['total_views']) {
				views = data['total_views'];
			}
			let vi = new ViewInt(views,interactions);
			storedHistory[vi.date]=vi.toStorage();
			let json={};
			json[vi.key()]=vi.toStorage();
			chrome.storage.local.set(json,function(){ console.log('saved ' + vi.toStorage());});
		}
		updateRecentActivityHistory();
		window.setTimeout(doStats, updateInterval);
		showStats();
	};

	var updateRecentActivityHistory = function() {
		const div=jQ("#theasis_viewsStatsPopup");
		const oneDay=1000*60*60*24; // milliseconds in a day
		let gData={v:[],i:[],vtrend:[],itrend:[],labels:[]}
		let date=Date.now();
		let html="<table id='theasis_recentActivityTable'><tr><th>30 Days To&hellip;</th><th>Views</th><th>(Trend/d)</th><th>Interactions</th><th>(Trend/d)</th></tr>";
		let keys=Object.keys(storedHistory);
		keys.sort(function(a,b){return b-a;});
		for(let i=0, l=keys.length; i<l && i<14; ++i) {
			let key=keys[i];
			let item=storedHistory[key];
			let trend=medianFromKeys(keys.slice(i,i+7));
			if (i===0) {
				currentTrend=trend;
			} else if (i===1) {
				lastTrend=trend;
			}
			gData.labels.unshift(key.slice(-2));
			gData.v.unshift(item.views);
			gData.vtrend.unshift(trend.views);
			gData.i.unshift(item.interactions);
			gData.itrend.unshift(trend.interactions);
			html += "<tr><td><tt>"+keyToDate(key)+"</tt></td><td>"+item.views+"</td><td>("+Math.round(trend.views/30)+")</td><td>"+item.interactions+"</td><td>("+Math.round(trend.interactions/30)+")</td></tr>";
		}
		html += "</table>";
		html += "<div class='ct-chart' id='viewschart' style='background:#dff;'><div style='text-align:center; font-weight:bold; padding-top:8px;'><span style='color:rgb(215, 2, 6);'>Views</span> &amp; <span style='color:rgb(80, 91, 175);'>Trend</span></div></div>";
		html += "<div class='ct-chart' id='interschart' style='background:#dff;'><div style='text-align:center; font-weight:bold; padding-top:8px; margin-top:2px;'><span style='color:rgb(215, 2, 6);'>Interactions</span> &amp; <span style='color:rgb(80, 91, 175);'>Trend</span></div></div>";
		div.html(html);

		let labels=[], data=[];
		for(let i=0,l=keys.length;i<l;++i) {
			let k=keys[i];
			data.push(storedHistory[k].views);
			labels.push(k.slice(-2));
		}
		let chartOptions={
			width:""+Math.max(labels.length*20,200)+"px",
			height:"160px"
		};

		new Chartist.Line('#viewschart',
		{
			labels: gData.labels,
			series: [gData.v,gData.vtrend]
		}, chartOptions);
		new Chartist.Line('#interschart',
		{
			labels: gData.labels,
			series: [gData.i,gData.itrend]
		}, chartOptions);
	};

	var showStats = function() {
		const link=jQ("#theasis_recentActivityLink");
		let viewsStyle="#fff";
		let interStyle="#fff";
		let viewsTrendStyle="#fff";
		let interTrendStyle="#fff";

		let keys=Object.keys(storedHistory);
		keys.sort(function(a,b){return b-a;});

		if (keys.length>1) {
			interStyle=statStyle(storedHistory[keys[1]].interactions,interactions);
			viewsStyle=statStyle(storedHistory[keys[1]].views,views);
		}
		let vTrend = "", iTrend = "";
		if (currentTrend) {
			vTrend = " ("+Math.round(currentTrend.views/30)+")";
			iTrend = " ("+Math.round(currentTrend.interactions/30)+")";
			if (lastTrend) {
				viewsTrendStyle=statStyle(lastTrend.views,currentTrend.views);
				interTrendStyle=statStyle(lastTrend.interactions,currentTrend.interactions);
			}
		}
		const text = "<span style='color:#888888'>Views:</span><span style='color:"+viewsStyle+";'>" + views
				+ "</span><span style='padding-right:1em; color:"+viewsTrendStyle+";'>" + vTrend
				+ "</span><span style='color:#888888'>Ints:</span><span style='color:"+interStyle+";'>" + interactions
				+ "</span><span style='color:"+interTrendStyle+";'>" + iTrend + "</span>";
		link.html(text);
		link.show();
		link.hover(
			showStatsHistory,
			hideStatsHistory
			);
	};

	var showStatsHistory = function() {
		const popup = jQ("#theasis_viewsStatsPopup");
		const trigger=jQ("#theasis_recentActivityLink");
		const position=trigger.position();
		popup.css({left:""+(position.left-250)+"px",top:""+(position.top+trigger.height()+8)+"px",right:"auto"}).show(100);
	};
	
	var hideStatsHistory = function() {
		jQ("#theasis_viewsStatsPopup").hide(300);
	};

	const GOODKEY=/^\d\d-\d\d$/;
	var recentActivityHistoryLoaded = function(obj) {
		if (obj) {
			let keys=Object.keys(obj);
			for(let i=0, l=keys.length;i<l;++i) {
				if (GOODKEY.test(keys[i])) {
					let o=obj[keys[i]];
					storedHistory[o.date]={views:o.views,interactions:o.interactions};
				}
			}

			updateRecentActivityHistory();
		}
	};
	
	var shortDateStr = function(d) {
		let date = d ? d : new Date();
		return dateStr(date).substr(5);
	};
	
	var dateStr = function(date) {
		let y = date.getFullYear();
		let m = date.getMonth()+1;
		let d = date.getDate();
		return ''+y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
	};

	var updateMessageCount = function() {
		jQ.ajax({
			url:"https://accountmanagement.gettyimages.com/Messages/GetUnreadMessageCount?"+scriptID
		}).done(messagesDataLoaded);
	};
	
	var messagesDataLoaded = function(data) {
		let count=0;
		const link=jQ("#theasis_messagesLink");
		if (data && data['UnreadCount']) {
			count=data.UnreadCount;
		}
		if (count==0) {
			link.hide();
		} else {
			let text="" + count + " Unread Message" + (count>1 ? "s" : "");
			link.text(text);
			link.show();
		}
	};
	
	var batchHistoryLoaded = function(obj) {
		if (obj.batchHistory) {
			batchHistory=obj.batchHistory;
		}
		recentActivityHistoryLoaded(obj);
	};
		
	chrome.storage.local.get(null,batchHistoryLoaded);
	setCss();
	addCountToToolbar();
	addForumToToolbar();
	addMessagesToToolbar();
	addRecentActivityToToolbar();
	
} // main

// load jQuery and kick off the meat of the code when jQuery has finished loading
function addJQuery(callback) {
	window.jQ=jQuery.noConflict(true);
	main(); 
}

function medianFromKeys(keys) {
	let vals=[];
	keys.forEach(function(k){
		vals.push(storedHistory[k]);
	});
	return median(vals);
}

function median(values) {
	const l=values.length;
	const val={interactions:0,views:0};
	if (l===0) return val;
	values.sort(function(a,b){return a.interactions-b.interactions;});
	const half=Math.floor(l/2);
	if (l%2) {
		val.interactions = values[half].interactions;
	} else {
		val.interactions = (values[half-1].interactions+values[half].interactions)/2;
	}
	values.sort(function(a,b){return a.views-b.views;});
	if (l%2) {
		val.views = values[half].views;
	} else {
		val.views = (values[half-1].views+values[half].views)/2;
	}
	return val;
}

// returns a string of todays date in the form YYYYMMDD
function yyyymmdd() {
	let date=new Date();
	let day=("0"+date.getDate()).slice(-2);
	let month=("0"+(date.getMonth()+1)).slice(-2);
	let year=date.getFullYear();
	return ""+year+month+day;
}

function keyToDate(key) {
	return key.slice(0,4)+"-"+key.slice(4,6)+"-"+key.slice(6);
}

// return a CSS colour comparing (oldval,newval)
function statStyle(a,b) {
	if (a<b) {
		return "#53c043"
	} else if (a>b) {
		return "#c05343"
	}
	return "#fff";
}

addJQuery(main);

