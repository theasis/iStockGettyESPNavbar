// Copyright (c) Martin McCarthy 2017
// version 0.2.9
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
//
const scriptID="plugin=theasis-chrome-getty-toolbar-0.2.9"
var currentDLs={};
var updateInterval = 10 * 60 * 1000; // every 10 minutes
var batchHistory={};

function main() {

	lastUpdated = function() {
		return "\nLast updated: "+new Date().toTimeString();
	};
	
	setCss = function() {
		jQ('head').append("<style type='text/css'>div.theasis_popupSummary { font-family:proxima-nova, Helvetica Neue, Arial, sans serif; font-size: 120%; position:absolute; display:none; top:30px; right:100px; background-color:#dde0e0; color:#333333; padding:2ex; opacity:0.95; border-radius: 3px; box-shadow: 1px 0px 3px 3px #666; z-index:10000; } #theasis_batchesTable td { padding:1ex; color:#fff; text-align:right; } #theasis_batchesTable th { padding:0.5ex; color:#000; background-color:#ccc; } #theasis_batchesTable td.theasis_batchName { background-color:#333; text-align:left; } td.theasis_batchCount { background-color:#555; } td.theasis_batchSubs { background-color:#1aabec; } td.theasis_batchReviewed { background-color:#53c04c; } td.theasis_batchWaiting { background-color:#c09b4c; } td.theasis_batchRevisable { background-color:#c0534c; } #theasis_batchesTable span.theasis_batchUpdatedLabel { font-size:90%; color: #aaa; } span.theasis_batchUpdated { font-style:italic; font-size:80%; color: #8ac; } span.theasis_batchSplus { font-style: italic; color: #235; } span.theasis_batchReject { font-style: italic; color: #532; } #theasis_messagesLink { color:#fc3; }</style>");
	};
	
	dlsPageLoaded = function(data) {
		const html=jQ(data);
		const d=html.find("h3").eq(1);
		let t="";
		let title="";
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
				title = title + l.substring(0,1) + ":" + (changed ? "*" : (currentDLs[l].changed ? "+" : "")) + v + " ";
			}
		});
		if (media && t.length==0) {
			t=" 0 :-( ";
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
	var batchIds;
	espDataLoaded = function(data) {
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
	
	checkForSplus = function(batchIds) {
		for (let bidObj of batchIds) {
			getBatch(bidObj);
		}
	};
	
	getBatch = function(bidObj) {
		if (!batchHistory[bidObj.id] || batchHistory[bidObj.id].updated!=bidObj.updated) {
			jQ.ajax({
				url:"https://esp.gettyimages.com/api/submission/v1/submission_batches/"+bidObj.id+"/contributions?page=1&pages_size=200&"+scriptID
			}).done(function(data){batchRead(data,bidObj)});
		} else {
			showSplus(bidObj.id,batchHistory[bidObj.id]['processed'],batchHistory[bidObj.id]['review']);

		}
	};
	
	batchRead = function(batchData,bidObj) {
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
	
	showSplus = function(bid,accepted,nominated) {
		if (accepted>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchReviewed').append('<br><span class="theasis_batchSplus">('+accepted+' S+)</span>');
		}
		if (nominated>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchWaiting').append('<br><span class="theasis_batchSplus">('+nominated+' S+)</span>');
		}
	};

	showRejects = function(bid,rejected) {
		if (rejected>0) {
			jQ('#theasis_batchRow'+bid+' .theasis_batchReviewed').append('<br><span class="theasis_batchReject">('+rejected+' Rej)</span>');
		}
	}
	
	updateHistory = function(items) {
		const div=jQ("#theasis_historyPopup");
		let date=Date.now();
		let html="<table>";
		for (let i=0;i<14;++i) {
			const key = shortDateStr(new Date(date));
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
		jQ("#theasis_historyPopup").show(100);
		chrome.storage.sync.get(null,updateHistory);
	};
	
	hideDlHistory = function() {
		jQ("#theasis_historyPopup").hide(300);
	};
	
	showBatches = function() {
		const trigger=jQ("#theasis_espLink").parent();
		const popup=jQ("#theasis_batchPopup");
		const position=trigger.position();
		// console.log("position: " + (position.left+trigger.width()) + " " + (position.top+trigger.height()-2));
		popup.css({left:""+(position.left-100)+"px",top:""+(position.top+trigger.height()+8)+"px",right:"auto"}).show(100);
	};
	
	hideBatches = function() {
		if (!jQ("#theasis_batchPopup").is(":hover") && !jQ("#theasis_espLink").parent().is(":hover")) {
			jQ("#theasis_batchPopup").hide(300);
		}
	};
	
	addCountToToolbar = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href");
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
		updateCount();
	};
	
	addMessagesToToolbar = function() {
		jQ("#theasis_accountLink").parent().after("<li><a id='theasis_messagesLink' href='https://accountmanagement.gettyimages.com/Messages/Messages'></a></li>");
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
		let html = "<li><a id='theasis_espLink' href='"+espUrl+"'>ESP: <span title='Data for "+stats.shownBatches+" of "+stats.batches+" batches"+when+"'>("+stats.shownBatches+"/"+stats.batches+")</span> <span id='theasis_esp_uploaded' style='color:#888888' title='"+stats.contribs+" uploaded"+when+"'>"+stats.contribs+"</span> <span id='theasis_esp_submitted' style='color:#1aabec' title='"+stats.submitted+" submitted"+when+"'>"+stats.submitted+"</span> <span id='theasis_esp_reviewed' style='color:#53c04c' title='"+stats.reviewed+" reviewed"+when+"'>"+stats.reviewed+"</span> <span id='theasis_esp_waiting' style='color:#c09b4c' title='"+stats.awaitingReview+" awaiting review"+when+"'>"+stats.awaitingReview+"</span> <span id='theasis_esp_revisable' style='color:#c0534c' title='"+stats.revisable+" revisable"+when+"'>"+stats.revisable+"</span></a></li>";
		espLi.replaceWith( html );
		jQ('#theasis_espLink').parent().hover(
			showBatches,
			hideBatches
			);
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
			url:"https://esp.gettyimages.com/api/submission/v1/submission_batches?date_from="+dateStr(then)+"&date_to="+dateStr(nowish)+"&page="+page+"&page_size=20&sort_column=created_at&sort_order=DESC&"+scriptID,
			statusCode: {
				401: espAuthFail
			}
		}).done(espDataLoaded);
	};
	
	updateCount = function() {
		const d = new Date();
		then = new Date(Date.now() - (1000*3600*24*7*13)); // 13 weeks ago
		nowish = new Date(Date.now() + (1000*3600*24)); // tomorrow
		jQ.ajax({
			url:"https://accountmanagement.gettyimages.com/Account/Profile?"+scriptID,
			statusCode: {
				401: dlsAuthFail
			}
		}).done(dlsPageLoaded);
		page=1;
		doDls();
		updateMessageCount();
	};
	
	updateMessageCount = function() {
		jQ.ajax({
			url:"https://accountmanagement.gettyimages.com/Messages/GetUnreadMessageCount?"+scriptID
		}).done(messagesDataLoaded);
	};
	
	messagesDataLoaded = function(data) {
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
	
	batchHistoryLoaded = function(obj) {
		if (obj.batchHistory) {
			batchHistory=obj.batchHistory;
		}
	};
	
	chrome.storage.local.get('batchHistory',batchHistoryLoaded);
	setCss();
	addCountToToolbar();
	addForumToToolbar();
	addMessagesToToolbar();
	
} // main

// load jQuery and kick off the meat of the code when jQuery has finished loading
function addJQuery(callback) {
	window.jQ=jQuery.noConflict(true);
	main(); 
}

addJQuery(main);
