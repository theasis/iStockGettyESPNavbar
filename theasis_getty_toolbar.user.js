// Copyright (c) Martin McCarthy 2017
// version 0.1.7
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
//
var currentDLs={};
var updateInterval = 10 * 60 * 1000; // every 10 minutes

function main() {

	lastUpdated = function() {
		return "\nLast updated: "+new Date().toTimeString();
	};
	
	dlsPageLoaded = function(data) {
		const html=jQ(data);
		const d=html.find("h3").eq(1);
		let t="";
		let media=false
		const tr=d.next().find("tr:gt(0)");
		tr.each(function(i){
			media=true;
			const l=jQ(this).find("td:first").text().trim();
			const v=jQ(this).find("td:eq(3)").text().trim();
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
				currentDLs[l].current=v;
				t = t + l.substring(0,1) + ":<span style='" + (changed ? "color:#44ee44" : (currentDLs[l].changed ? "color:#66aa44" : "color:#eeeeee")) +"' title='"+v+" "+l+" downloads this year"+lastUpdated()+"\n"+currentDLs[l].history+"'>" + v + "</span> ";
			}
		});
		if (media && t.length==0) {
			t=" 0 :-( ";
		}
		jQ("#theasis_DLCount").html(t);
		let storedDLs={};
		for (const k in currentDLs) {
			if (currentDLs[k]!=null && currentDLs[k].current>0) {
				storedDLs[k]=currentDLs[k].current;
			}
		}
		let storedObject={};
		storedObject[shortDateStr()]=storedDLs;
		chrome.storage.sync.set(storedObject,
			function(){
				// console.log("saved DLs to sync storage");
			});
		window.setTimeout(updateCount, updateInterval);
	};
	
	var stats={};
	var page=1;	
	var then;
	var nowish;
	espDataLoaded = function(data) {
		if (page == 1) {
			stats = {
				batches:data.meta.total_items,
				shownBatches:0,
				contribs:0,
				awaitingReview:0,
				reviewed:0,
				revisable:0,
				submitted:0
			}
		}
		stats.shownBatches += data.items.length;
		for (const item of data.items) {
			stats.contribs += item.contributions_count;
			stats.awaitingReview += item.contributions_awaiting_review_count;
			stats.reviewed += item.reviewed_contributions_count;
			stats.revisable += item.revisable_contributions_count;
			stats.submitted += item.submitted_contributions_count;
		}
		addEspToToolbar(stats);
		if (stats.shownBatches<stats.batches) {
			page += 1;
			doDls();
		}
	};
	
	updateHistory = function(items) {
		const div=jQ("#theasis_historyPopup");
		let date=Date.now();
		let html="<table>";
		for (let i=0;i<7;++i) {
			const key = shortDateStr(new Date(date));
			console.log(key);
			if (items[key]) {
				html += "<tr><td><i>"+key+"</i></td><td>";
				for (let l in items[key]) {
					html += "<span style='padding-left:1em;'>"+l+": <b>"+items[key][l]+"</b></span>";
				}
				html += "</td></tr>";
			}
			date -= 1000*3600*24;
		}
		html += "</table>";
		div.html(html);
	};
	
	showDlHistory = function() {
		jQ("#theasis_historyPopup").show(300);
		chrome.storage.sync.get(null,updateHistory);
	};
	
	hideDlHistory = function() {
		jQ("#theasis_historyPopup").hide(300);
	};
	
	historyCSS = "font-family:proxima-nova, Helvetica Neue, Arial, sans serif; font-size: 120%; position:absolute; display:none; top:30px; right:100px; background-color:#dde0e0; color:#333333; padding:2ex; opacity:0.9; border-radius: 3px; box-shadow: 1px 0px 3px 3px #666; z-index:10000;";
	addCountToToolbar = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href");
		jQ("body").css({position:"relative"}).append("<div id='theasis_historyPopup' style='"+historyCSS+"'>History</div>");
		accountLi.replaceWith( "<li><a id='theasis_accountLink' href='"+accountUrl+"'><span style='color:#888888'>DLs: </span><span id='theasis_DLCount' style='color:#cccccc'></span></a></li>" );
		jQ('#theasis_accountLink span:first').hover(
			showDlHistory,
			hideDlHistory
			);
		updateCount();
	};
	
	dlsAuthFail = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href");
		accountLi.replaceWith( "<li><a href='"+accountUrl+"'>Account log in</a></li>" );
		updateCount();
	};
	
	addEspToToolbar = function(stats) {
		const when=lastUpdated();
		const espLi = jQ("nav.micro ul:first li:first");
		const espUrl = espLi.find("a:first").attr("href");
		let html = "<li><a href='"+espUrl+"'>ESP: <span title='Data for "+stats.shownBatches+" of "+stats.batches+" batches"+when+"'>("+stats.shownBatches+"/"+stats.batches+")</span> <span id='theasis_esp_uploaded' style='color:#888888' title='"+stats.contribs+" uploaded"+when+"'>"+stats.contribs+"</span> <span id='theasis_esp_submitted' style='color:#1aabec' title='"+stats.submitted+" submitted"+when+"'>"+stats.submitted+"</span> <span id='theasis_esp_reviewed' style='color:#53c04c' title='"+stats.reviewed+" reviewed"+when+"'>"+stats.reviewed+"</span> <span id='theasis_esp_waiting' style='color:#c09b4c' title='"+stats.awaitingReview+" awaiting review"+when+"'>"+stats.awaitingReview+"</span> <span id='theasis_esp_revisable' style='color:#c0534c' title='"+stats.revisable+" revisable"+when+"'>"+stats.revisable+"</span></a></li>";
		espLi.replaceWith( html );
	};
	
	espAuthFail = function() {
		const espLi = jQ("nav.micro ul:first li:first");
		const espUrl = espLi.find("a:first").attr("href");
		let html = "<li><a href='"+espUrl+"'>ESP: log in</a></li>";
		espLi.replaceWith( html );
	}
	
	addForumToToolbar = function() {
			jQ("nav.micro ul:first").append( "<li><a href='https://contributors.gettyimages.com/forum/'><span>Forum</span></a></li>" );
	};
	
	shortDateStr = function(d) {
		let date = d ? d : new Date();
		return dateStr(date).substr(5);
	};
	
	dateStr = function(date) {
		let y = date.getFullYear();
		let m = date.getMonth()+1;
		let d = date.getDate();
		return ''+y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
	};
	
	doDls = function() {
		jQ.ajax({
			url:"https://esp.gettyimages.com/api/submission/v1/submission_batches?date_from="+dateStr(then)+"&date_to="+dateStr(nowish)+"&page="+page+"&page_size=10&sort_column=created_at&sort_order=DESC",
			statusCode: {
				401: espAuthFail
			}
		}).done(espDataLoaded);
	};
	
	updateCount = function() {
		const d = new Date();
		then = new Date(Date.now() - (1000*3600*24*28)); // 4 weeks ago
		nowish = new Date(Date.now() + (1000*3600*24)); // tomorrow
		jQ.ajax({
			url:"https://accountmanagement.gettyimages.com/Account/Profile",
			statusCode: {
				401: dlsAuthFail
			}
		}).done(dlsPageLoaded);
		page=1;
		doDls();
	};
	
	addCountToToolbar();
	addForumToToolbar();
	
}

// load jQuery and kick off the meat of the code when jQuery has finished loading
function addJQuery(callback) {
	window.jQ=jQuery.noConflict(true);
	main(); 
}

addJQuery(main);
