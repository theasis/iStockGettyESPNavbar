// Copyright (c) Martin McCarthy 2017
// version 0.1.0
// Chrome Browser Script
//
// Make some tweaks to (potentially) improve the iStock contributor pages on gettyimages.com.
//
// v0.0.1 06 Feb 2017 Martin McCarthy
//        First version
// v0.1.0 07 Feb 2017 Martin McCarthy
//		  First public version
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
		const tr=d.next().find("tr:gt(0)");
		tr.each(function(i){
			const l=jQ(this).find("td:first").text().trim();
			const v=jQ(this).find("td:eq(3)").text().trim();
			let changed=false;
			if (currentDLs[l]>0 && v>0 && currentDLs[l]!=v) {
				changed=true;
			}
			if (v>0) {
				currentDLs[l]=v;
			}
			t = t + l.substring(0,1) + ":<span style='" + (changed ? "color:#44ee44" : "color:#eeeeee") +"' title='"+v+" "+l+" downloads this year"+lastUpdated()+"'>" + v + "</span> ";
		});
		jQ("#theasis_DLCount").html(t);
		window.setTimeout(updateCount, updateInterval);
	};
	
	espDataLoaded = function(data) {
		let stats={
			batches:data.meta.total_items,
			shownBatches:data.items.length,
			contribs:0,
			awaitingReview:0,
			reviewed:0,
			revisable:0,
			submitted:0
		};
		for (const item of data.items) {
			stats.contribs += item.contributions_count;
			stats.awaitingReview += item.contributions_awaiting_review_count;
			stats.reviewed += item.reviewed_contributions_count;
			stats.revisable += item.revisable_contributions_count;
			stats.submitted += item.submitted_contributions_count;
		}
		addEspToToolbar(stats);
	};
	
	addCountToToolbar = function() {
		const accountLi = jQ("nav.micro ul:first li:eq(1)");
		const accountUrl = accountLi.find("a:first").attr("href");
		accountLi.replaceWith( "<li><a href='"+accountUrl+"'><span style='color:#888888'>DLs: </span><span id='theasis_DLCount' style='color:#cccccc'></span></a></li>" );
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
	
	dateStr = function(date) {
		let y = date.getFullYear();
		let m = date.getMonth()+1;
		let d = date.getDate();
		return ''+y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
	};
	
	updateCount = function() {
		const d = new Date();
		const then = new Date(Date.now() - (1000*3600*24*28)); // 4 weeks ago
		const nowish = new Date(Date.now() + (1000*3600*24)); // tomorrow
		console.log("Timeout! " + d.toLocaleTimeString());
		jQ.ajax({
			url:"https://accountmanagement.gettyimages.com/Account/Profile",
			statusCode: {
				401: dlsAuthFail
			}
		}).done(dlsPageLoaded);
		jQ.ajax({
			url:"https://esp.gettyimages.com/api/submission/v1/submission_batches?date_from="+dateStr(then)+"&date_to="+dateStr(nowish)+"&page=1&page_size=10&sort_column=created_at&sort_order=DESC",
			statusCode: {
				401: espAuthFail
			}
		}).done(espDataLoaded);
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
