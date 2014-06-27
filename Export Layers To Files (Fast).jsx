// NAME: 
// 	Export Layers To Files

// DESCRIPTION: 
//  Improved version of the built-in "Export Layers To Files" script:
//  * Supports PNG and possibly other formats in the future.
//  * Does not create document duplicates, so it's much faster.
//	Saves each layer in the active document to a file in a preferred format named after the layer. Supported formats:
//  * PNG
//  * JPEG
//  * Targa

// REQUIRES: 
// 	Adobe Photoshop CS2 or higher

// Most current version always available at: https://github.com/skjorn/Photoshop-Export-Layers-as-Images

// enable double-clicking from Finder/Explorer (CS2 and higher)
#target photoshop
app.bringToFront();

bootstrap();

//
// Processing logic
//

function main()
{
    // user preferences
    prefs = new Object();
    prefs.format = "";
	prefs.fileExtension = "";
	try {
		prefs.filePath = app.activeDocument.path;
	}
	catch (e) {
		prefs.filePath = Folder.myDocuments;
	}
	prefs.formatArgs = null;
	prefs.visibleOnly = false;
	prefs.outputPrefix = "";
	
	userCancelled = false;
	
	// create progress bar
	var progressBarWindow = createProgressBar();
	if (! progressBarWindow) {
		return "cancel";
	}
	
	// collect layers	
	var profiler = new Profiler(env.profiling);
	var collected = collectLayers(progressBarWindow);
	if (userCancelled) {
		return "cancel";
	}
	layers = collected.layers;
	visibleLayers = collected.visibleLayers;
	var collectionDuration = profiler.getDuration(true, true);		
	if (env.profiling) {
		alert("Layers collected in " + profiler.format(collectionDuration), "Debug info");
	}
	
    // show dialogue
	if (showDialog()) {
		// export
		profiler.resetLastTime();
	
		var count = exportLayers(prefs.visibleOnly, progressBarWindow);
		var exportDuration = profiler.getDuration(true, true);
		
		var message = "";
		if (userCancelled) {
			message += "Export cancelled!\n\n";
		}
		message += "Saved " + count.count + " files.";
		if (env.profiling) {
			message += "\n\nExport function took " + profiler.format(collectionDuration) + " + " + profiler.format(exportDuration) + " to perform.";
		}
		if (count.error) {
			message += "\n\nSome layers failed to export! (Are there many layers with the same name?)"
		}
		alert(message, "Finished", count.error);
	}
	else {
		return "cancel";
	}
}

function exportLayers(visibleOnly, progressBarWindow)
{
	var retVal = {
		count: 0,
		error: false
	};
	var doc = activeDocument;
	
	var layerCount = layers.length;
	
	if ((layerCount == 1) && layers[0].isBackgroundLayer) {
		// Flattened images don't support LayerComps or visibility toggling, so export it directly.
		if (saveImage(layers[0].name)) {
			++retVal.count;
		}
		else {
			retVal.error = true;
		}
	}
	else {	
		// capture current layer state
		var lastHistoryState = doc.activeHistoryState;
		var capturedState = doc.layerComps.add("ExportLayersToFilesTmp", "Temporary state for Export Layers To Files script", false, false, true);
		
		var layersToExport = visibleOnly ? visibleLayers : layers;
		const count = layersToExport.length;
		
		if (progressBarWindow) {
			showProgressBar(progressBarWindow, "Exporting 1 of " + count + "...", count);
		}
	
		// Turn off all layers when exporting all layers - even seemingly invisible ones.
		// When visibility is switched, the parent group becomes visible and a previously invisible child may become visible by accident.
		for (var i = 0; i < count; ++i) {
			layersToExport[i].visible = false;
		}
			
		// export layers
		for (var i = 0; i < count; ++i) {
			var layer = layersToExport[i];
			layer.visible = true;
			if (saveImage(layer.name)) {
				++retVal.count;
			}
			else {
				retVal.error = true;
			}
			layer.visible = false;
			
			if (progressBarWindow) {
				updateProgressBar(progressBarWindow, "Exporting " + (i + 1) + " of " + count + "...");
				repaintProgressBar(progressBarWindow);
				if (userCancelled) {
					break;
				}
			}
		}
				
		// restore layer state
		capturedState.apply();
		capturedState.remove();
		if (env.version <= 9) {
			doc.activeHistoryState = lastHistoryState;
			app.purge(PurgeTarget.HISTORYCACHES);
		}

		if (progressBarWindow) {
			progressBarWindow.hide();
		}
	}
		
	return retVal;
}

function saveImage(layerName) 
{
    var fileName = prefs.outputPrefix + layerName;
	fileName = fileName.replace(/[\\\*\/\?:"\|<>]/g, ''); 
    fileName = fileName.replace(/[ ]/g, '_'); 
    if(fileName.length == 0) fileName = "Layer";
    var handle = getUniqueName(prefs.filePath + "/" + fileName);
	if (! handle) {
		return false;
	}
    
	if (prefs.formatArgs instanceof ExportOptionsSaveForWeb) {
		// Document.exportDocument() is unreliable -- it ignores some of the export options.
		// Avoid it if possible.
		switch (prefs.format) {
		
		case "PNG-24":
			exportPng24AM(handle, prefs.formatArgs);
			break;
			
		case "PNG-8":
			exportPng8AM(handle, prefs.formatArgs);
			break;
			
		default:
			activeDocument.exportDocument(handle, ExportType.SAVEFORWEB, prefs.formatArgs);
			break;
		}
	}
	else {
		activeDocument.saveAs(handle, prefs.formatArgs, true, Extension.LOWERCASE); 
	}
	
	return true;
}

function getUniqueName(fileroot) 
{ 
    // form a full file name
    // if the file name exists, a numeric suffix will be added to disambiguate
	
    var filename = fileroot;
    for (var i=1; i<100; i++) {
        var handle = File(filename + prefs.fileExtension.toLowerCase()); 
        if(handle.exists) {
            filename = fileroot + "-" + padder(i, 3);
        } 
		else {
            return handle; 
        }
    }
	
	return false;
} 

function forEachLayer(inCollection, doFunc, result, traverseInvisibleSets)
{
	var length = inCollection.length;
	for (var i = 0; i < length; ++i) {
		var layer = inCollection[i];
		if (layer.typename == "LayerSet") {
			if (traverseInvisibleSets || layer.visible) {
				result = forEachLayer(layer.layers, doFunc, result, traverseInvisibleSets);
			}
		}
		else {
			result = doFunc(layer, result);
		}
	}
	
	return result;
}

// Indexed access to Layers via the default provided API is very slow, so all layers should be 
// collected into a separate collection beforehand and that should be accessed repeatedly.
function collectLayers(progressBarWindow)
{
	// proxy to lower level ActionManager code
	return collectLayersAM(progressBarWindow);
}

//
// User interface
//

function createProgressBar()
{
 	// read progress bar resource
	var rsrcFile = new File(env.scriptFileDirectory + "/progress_bar.json");
	var rsrcString = loadResource(rsrcFile);
	if (! rsrcString) {
		return false;
	}

   // create window
	var win;
	try {
		win = new Window(rsrcString);
	}	
	catch (e) {
		alert("Progress bar resource is corrupt! Please, redownload the script with all files.", "Error", true);
		return false;
	}
	
	win.barRow.cancelBtn.onClick = function() {
		userCancelled = true;
	};
	
	win.onClose = function() {
		userCancelled = true;
		return false;
	};
	
	return win;
}

function showProgressBar(win, message, maxValue)
{
	win.lblMessage.text = message;
	win.barRow.bar.maxvalue = maxValue;
	win.barRow.bar.value = 0;
	
	win.center();
	win.show();
	repaintProgressBar(win, true);
}

function updateProgressBar(win, message)
{
	++win.barRow.bar.value;
	if (message) {
		win.lblMessage.text = message;
	}
}

function repaintProgressBar(win, force /* = false*/) 
{
	if (env.version >= 11) {	// CS4 added support for UI updates; the previous method became unbearably slow, as is app.refresh()
		if (force) {
			app.refresh();
		}
		else {  
			win.update();
		}
	}
	else {	
		// CS3 and below
		var d = new ActionDescriptor();
		d.putEnumerated(app.stringIDToTypeID('state'), app.stringIDToTypeID('state'), app.stringIDToTypeID('redrawComplete'));
		executeAction(app.stringIDToTypeID('wait'), d, DialogModes.NO);
  }
}

function showDialog() 
{
 	// read dialog resource
	var rsrcFile = new File(env.scriptFileDirectory + "/dialog.json");
	var rsrcString = loadResource(rsrcFile);
	if (! rsrcString) {
		return false;
	}

   // build dialogue
	var dlg;
	try {
		dlg = new Window(rsrcString);
	}	
	catch (e) {
		alert("Dialog resource is corrupt! Please, redownload the script with all files.", "Error", true);
		return false;
	}
	
	// destination path
	dlg.funcArea.content.grpDest.txtDest.text = prefs.filePath.fsName;
	dlg.funcArea.content.grpDest.btnDest.onClick = function() {
		var newFilePath = Folder.selectDialog("Select destination folder", prefs.filePath);
		if (newFilePath) {
			prefs.filePath = newFilePath;
			dlg.funcArea.content.grpDest.txtDest.text = newFilePath.fsName;
		}
	}
	
	// layer subset selection
	dlg.funcArea.content.grpLayers.radioLayersAll.onClick = function() {
		prefs.visibleOnly = false;
	}
	dlg.funcArea.content.grpLayers.radioLayersVis.onClick = function() {
		prefs.visibleOnly = true;
	}
	
	var formatDropDown = dlg.funcArea.content.grpFileType.drdFileType;
	var optionsPanel = dlg.funcArea.content.pnlOptions;

    // file type - call cloned getDialogParams*() for new file formats here
	// (add a single line, the rest is taken care of)
    var saveOpt = [];
	var paramFuncs = [getDialogParamsPNG24, getDialogParamsPNG8, getDialogParamsJPEG, getDialogParamsTarga];
    for (var i = 0, len = paramFuncs.length; i < len; ++i) {
		var optionsRoot = optionsPanel.add("group");
		optionsRoot.orientation = "column";
		optionsRoot.alignChildren = "left";
		var opts = paramFuncs[i](optionsRoot);
		opts.controlRoot = optionsRoot;
		saveOpt.push(opts);
		
        formatDropDown.add("item", saveOpt[i].type);
    }
	
    // show proper file type options
    formatDropDown.onChange = function() {
		// Note: There's a bug in CS5 and CC where ListItem.selected doesn't report correct value in onChange().
		// A workaround is to rely on DropDownList.selection instead.
		for (var i = saveOpt.length - 1; i >= 0; --i) {
			saveOpt[i].controlRoot.hide();
		}
		saveOpt[this.selection.index].controlRoot.show();
    }; 
	
    formatDropDown.selection = 0;
	  	   
    // buttons
    dlg.funcArea.buttons.btnRun.onClick = function() {
		// collect arguments for saving and proceed
		prefs.outputPrefix = dlg.funcArea.content.grpPrefix.editPrefix.text;
		prefs.outputPrefix = prefs.outputPrefix.replace(/^\s+|\s+$/gm, '');
		if (prefs.outputPrefix.length > 0) {
			prefs.outputPrefix += " ";
		}
		var selIdx = formatDropDown.selection.index;
		saveOpt[selIdx].handler(saveOpt[selIdx].controlRoot);
        dlg.close(1); 
    }; 
    dlg.funcArea.buttons.btnCancel.onClick = function() {
        dlg.close(0); 
    }; 
	
	// warning message
	dlg.warning.message.text = formatString(dlg.warning.message.text, layers.length, visibleLayers.length);

	dlg.center(); 
    return dlg.show();
}

// Clone these two functions to add a new export file format - GUI
function getDialogParamsTarga(parent)
{
	var depth = parent.add("group");
	depth.add("statictext", undefined, "Depth:");
	var bitsPerPixelLabels = ["16 bit", "24 bit", "32 bit"];
	parent.bitsPerPixel = depth.add("dropdownlist", undefined, bitsPerPixelLabels);
	parent.bitsPerPixel.selection = 2;
	
	parent.alpha = parent.add("checkbox", undefined, "With alpha channel");
	parent.alpha.value = true;
		
	parent.rle = parent.add("checkbox", undefined, "RLE compression");
	parent.rle.value = true;
	
	return {type: "TGA", handler: onDialogSelectTarga};
}

// Clone these two functions to add a new export file format - result handler
function onDialogSelectTarga(parent)
{
	prefs.format = "TGA";
	prefs.fileExtension = ".tga";
	prefs.formatArgs = new TargaSaveOptions();
	prefs.formatArgs.alphaChannels = parent.alpha.value;
	prefs.formatArgs.rleCompression = parent.rle.value;
	var resolution_enum = [TargaBitsPerPixels.SIXTEEN, TargaBitsPerPixels.TWENTYFOUR, TargaBitsPerPixels.THIRTYTWO];
	prefs.formatArgs.resolution = resolution_enum[parent.bitsPerPixel.selection.index];
}

function getDialogParamsJPEG(parent)
{
	const ROW_HEIGHT = 16;
	
	// quality
	var row = parent.add("group");
	var qualityLabel = row.add("statictext", undefined, "Quality:");
	qualityLabel.preferredSize = [40, ROW_HEIGHT];
	parent.quality = row.add("slider", undefined, 12, 0, 12);
	parent.quality.preferredSize = [140, 20];
	var qualityValue = row.add("statictext", undefined, "12");
	qualityValue.preferredSize = [30, ROW_HEIGHT];
	
	parent.quality.onChanging = function() {
		this.value = Math.round(this.value);
		qualityValue.text = this.value;
	};
	
	// matte
	row = parent.add("group");
	var matteLabel = row.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [40, ROW_HEIGHT];
	parent.matte = row.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;
	
	// colour profile
	parent.icc = parent.add("checkbox", undefined, "ICC Profile");
	
	// optimised
	parent.optimised = parent.add("checkbox", undefined, "Optimized");
	parent.optimised.value = true;
	
	// progressive
	parent.progressive = parent.add("checkbox", undefined, "Progressive");
	parent.progressive.onClick = function() {
		parent.optimised.enabled = ! this.value;
	};
	
	return {type: "JPG", handler: onDialogSelectJPEG};
}

function onDialogSelectJPEG(parent)
{
	prefs.format = "JPG";
	prefs.fileExtension = ".jpg";
	prefs.formatArgs = new JPEGSaveOptions();
	const matteValue = [MatteType.WHITE, MatteType.BLACK, MatteType.SEMIGRAY, MatteType.NONE, MatteType.BACKGROUND, MatteType.FOREGROUND];
	with (prefs.formatArgs) {
		quality = parent.quality.value;
		matte = matteValue[parent.matte.selection.index];
		embedColorProfile = parent.icc.value;
		if (parent.progressive.value) {
			formatOptions = FormatOptions.PROGRESSIVE;
			scans = 3;
		}
		else if (parent.optimised.value) {
			formatOptions = FormatOptions.OPTIMIZEDBASELINE;
		}
		else {
			formatOptions = FormatOptions.STANDARDBASELINE;
		}
	}
}

function getDialogParamsPNG24(parent)
{
	const ROW_HEIGHT = 16;
	
	// matte
	var row = parent.add("group");	
	var matteLabel = row.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [40, ROW_HEIGHT];
	parent.matte = row.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;	
	parent.matte.enabled = false;
	
	// transparency
	parent.transparency = parent.add("checkbox", undefined, "Transparency");
	parent.transparency.value = true;
	
	parent.transparency.onClick = function() {
		parent.matte.enabled = ! this.value;
	};
	
	// interlaced
	parent.interlaced = parent.add("checkbox", undefined, "Interlaced");
	
	return {type: "PNG-24", handler: onDialogSelectPNG24};
}

function onDialogSelectPNG24(parent)
{
	prefs.format = "PNG-24";
	prefs.fileExtension = ".png";
	
	var WHITE = new RGBColor(); 
	WHITE.red = 255; WHITE.green = 255; WHITE.blue = 255;
	var BLACK = new RGBColor(); 
	BLACK.red = 0; BLACK.green = 0; BLACK.blue = 0;
	var GRAY = new RGBColor(); 
	GRAY.red = 127; GRAY.green = 127; GRAY.blue = 127;
	
	const matteColours = [WHITE, BLACK, GRAY, BLACK, backgroundColor.rgb, foregroundColor.rgb];
	
	prefs.formatArgs = new ExportOptionsSaveForWeb();
	with (prefs.formatArgs) {
		format = SaveDocumentType.PNG;
		PNG8 = false;
		interlaced = parent.interlaced.value;
		transparency = parent.transparency.value;
		matteColor = matteColours[parent.matte.selection.index];
	}
}

function getDialogParamsPNG8(parent)
{
	const ROW_HEIGHT = 16;
	const LABEL_WIDTH = 105;
	
	// color reduction
	var row = parent.add("group");
	var crLabel = row.add("statictext", undefined, "Color reduction:");
	crLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.colourReduction = row.add("dropdownlist", undefined, [
		"Perceptual", 
		"Selective", 
		"Adaptive", 
		"Restrictive (Web)", 
		"-",
		"Black & White", 
		"Grayscale",
		"Mac OS",
		"Windows"
	]);
	parent.colourReduction.selection = 1;	
	
	// number of colors
	row = parent.add("group");
	var colorsLabel = row.add("statictext", undefined, "Number of colors:");
	colorsLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.colors = row.add("edittext", undefined, "256");
	parent.colors.preferredSize = [70, 18];
	parent.colorsLast = 256;
	
	parent.colors.onChange = function() {
		var colorNum = parseInt(this.text, 10);
		if (isNaN(colorNum)) {
			colorNum = parent.colorsLast;
		}
		else if (colorNum < 2) {
			colorNum = 2;
		}
		else if (colorNum > 256) {
			colorNum = 256;
		}
		this.text = colorNum;
		parent.colorsLast = colorNum;
	};
	
	// dither
	row = parent.add("group");
	var ditherLabel = row.add("statictext", undefined, "Dither:");
	ditherLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.dither = row.add("dropdownlist", undefined, [
		"None", 
		"Diffusion",
		"Pattern",
		"Noise"
	]);
	parent.dither.selection = 0;
	
	// dither amount
	var ditherAmountGroup = row.add("group");
	parent.ditherAmount = ditherAmountGroup.add("slider", undefined, 100, 0, 100);
	var ditherAmountValue = ditherAmountGroup.add("statictext", undefined, "100%");
	ditherAmountGroup.enabled = false;
	
	parent.ditherAmount.onChanging = function() {
		this.value = Math.round(this.value);
		ditherAmountValue.text = "" + this.value + "%";
	};
	
	parent.dither.onChange = function() {
		ditherAmountGroup.enabled = (this.selection == 1);
	};
	
	// interlaced
	parent.interlaced = parent.add("checkbox", undefined, "Interlaced");
	
	// transparency
	var transparencyPanel = parent.add("panel", undefined, "Transparency:");
	transparencyPanel.orientation = "column";
	transparencyPanel.alignChildren = "left";
	parent.transparency = transparencyPanel.add("checkbox", undefined, "Enabled");
	parent.transparency.value = true;
	
	// matte
	var matteRow = transparencyPanel.add("group");
	var matteLabel = matteRow.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [LABEL_WIDTH + 8, ROW_HEIGHT];
	parent.matte = matteRow.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;	
	matteRow.enabled = false;
	
	// transparency dither
	var tdRow = transparencyPanel.add("group");
	var transDitherLabel = tdRow.add("statictext", undefined, "Transparency dither:");
	transDitherLabel.preferredSize = [LABEL_WIDTH + 8, ROW_HEIGHT];
	parent.transparencyDither = tdRow.add("dropdownlist", undefined, [
		"None", 
		"Diffusion",
		"Pattern",
		"Noise"
	]);
	parent.transparencyDither.selection = 0;
	
	// transparency dither amount
	var transDitherAmountGroup = tdRow.add("group");
	parent.transparencyDitherAmount = transDitherAmountGroup.add("slider", undefined, 100, 0, 100);
	var transDitherAmountValue = transDitherAmountGroup.add("statictext", undefined, "100%");
	transDitherAmountGroup.enabled = false;
	
	parent.transparencyDitherAmount.onChanging = function() {
		this.value = Math.round(this.value);
		transDitherAmountValue.text = "" + this.value + "%";
	};
	
	parent.transparencyDither.onChange = function() {
		transDitherAmountGroup.enabled = (this.selection == 1);
	};
	
	parent.transparency.onClick = function() {
		matteRow.enabled = ! this.value;
		tdRow.enabled = this.value;
	};
	
	return {type: "PNG-8", handler: onDialogSelectPNG8};
}

function onDialogSelectPNG8(parent)
{
	prefs.format = "PNG-8";
	prefs.fileExtension = ".png";
		
	const colorReductionType = [
		ColorReductionType.PERCEPTUAL,
		ColorReductionType.SELECTIVE,
		ColorReductionType.ADAPTIVE,
		ColorReductionType.RESTRICTIVE,
		null,
		ColorReductionType.BLACKWHITE,
		ColorReductionType.GRAYSCALE,
		ColorReductionType.MACINTOSH,
		ColorReductionType.WINDOWS
	];
	const ditherType = [
		Dither.NONE,
		Dither.DIFFUSION,
		Dither.PATTERN,
		Dither.NOISE
	];
	var WHITE = new RGBColor(); 
	WHITE.red = 255; WHITE.green = 255; WHITE.blue = 255;
	var BLACK = new RGBColor(); 
	BLACK.red = 0; BLACK.green = 0; BLACK.blue = 0;
	var GRAY = new RGBColor(); 
	GRAY.red = 127; GRAY.green = 127; GRAY.blue = 127;
	const matteColours = [WHITE, BLACK, GRAY, BLACK, backgroundColor.rgb, foregroundColor.rgb];
	
	prefs.formatArgs = new ExportOptionsSaveForWeb();
	with (prefs.formatArgs) {
		format = SaveDocumentType.PNG;
		PNG8 = true;
		colorReduction = colorReductionType[parent.colourReduction.selection.index];
		colors = parseInt(parent.colors.text, 10);
		dither = ditherType[parent.dither.selection.index];
		if (dither == Dither.DIFFUSION) {
			ditherAmount = parent.ditherAmount.value;
		}
		interlaced = parent.interlaced.value;
		transparency = parent.transparency.value;
		matteColor = matteColours[parent.matte.selection.index];
		if (transparency) {
			transparencyDither = ditherType[parent.transparencyDither.selection.index];
			if (transparencyDither == Dither.DIFFUSION) {
				transparencyAmount = parent.transparencyDitherAmount.value;
			}
		}
	}
}

//
// Bootstrapper (version support, getting additional environment settings, error handling...)
//

function bootstrap() 
{
    function showError(err) {
        alert(err + ': on line ' + err.line, 'Script Error', true);
    }

	// initialisation of class methods
	defineProfilerMethods();
	
	// check if there's a document open
	try {
		var doc = activeDocument;		// this actually triggers the exception
		if (! doc) {					// this is just for sure if it ever behaves differently in other versions
			throw new Error();
		}
	}
	catch (e) {
		alert("No document is open! Nothing to export.", "Error", true);
		return "cancel";
	}
	
    try {
		// setup the environment
		
		env = new Object();
		
		env.profiling = false;
		
		env.version = parseInt(version, 10);
		
		if (env.version < 9) {
			alert("Photoshop versions before CS2 are not supported!", "Error", true);
			return "cancel";
		}
		
		env.cs3OrHigher = (env.version >= 10);
		
		// get script's file name
		if (env.cs3OrHigher) {
			env.scriptFileName = $.fileName;
		}
		else {
			try {
				//throw new Error();		// doesn't provide the file name, at least in CS2
				var illegal = RUNTIME_ERROR;
			}
			catch (e) {
				env.scriptFileName = e.fileName;
			}
		}
		
		env.scriptFileDirectory = (new File(env.scriptFileName)).parent;
		
		// run the script itself
        if (env.cs3OrHigher) {
			// suspend history for CS3 or higher
            activeDocument.suspendHistory('Export Layers To Files', 'main()');
        } 
		else {
            main();
        }
    } 
	catch(e) {
        // report errors unless the user cancelled
        if (e.number != 8007) showError(e);
		return "cancel";
    }
}

//
// ActionManager mud
//

// Faster layer collection:
// 	https://forums.adobe.com/message/2666611

function collectLayersAM(progressBarWindow)
{
	var layers = [],
		visibleLayers = [];
	var layerCount = 0;

	var ref = null;
	var desc = null;
	
	const idOrdn = charIDToTypeID("Ordn");
	
	// Get layer count reported by the active Document object - it never includes the background.
	ref = new ActionReference();
	ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
	desc = executeActionGet(ref);
	layerCount = desc.getInteger(charIDToTypeID("NmbL"));

	if (layerCount == 0) {
		// This is a flattened image that contains only the background (which is always visible).
		var bg = activeDocument.backgroundLayer;
		layers.push(bg);
		visibleLayers.push(bg);
	}
	else {
		// There are more layers that may or may not contain a background. The background is always at 0;
		// other layers are indexed from 1.
		
		const idLyr = charIDToTypeID("Lyr ");
		const idLayerSection = stringIDToTypeID("layerSection");
		const idVsbl = charIDToTypeID("Vsbl");
		const idNull = charIDToTypeID("null");
		const idSlct = charIDToTypeID("slct");
		const idMkVs = charIDToTypeID("MkVs");
		
		const FEW_LAYERS = 10;
		
		if (layerCount <= FEW_LAYERS) {
			// don't show the progress bar UI for only a few layers
			progressBarWindow = null;
		}
		
		if (progressBarWindow) {
			// The layer count is actually + 1 if there's a background present, but it should be no biggie.
			showProgressBar(progressBarWindow, "Collecting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
		}
	
		ref = new ActionReference();
		ref.putEnumerated(idLyr, idOrdn, charIDToTypeID("Trgt"));
		var selectionDesc = executeActionGet(ref);
		
		try {
			// Collect normal layers.
			var visibleInGroup = [true];
			var layerVisible;
			for (var i = layerCount; i >= 1; --i) {
				// check if it's an art layer (not a group) that can be selected
				ref = new ActionReference();
				ref.putIndex(idLyr, i);
				desc = executeActionGet(ref);
				layerVisible = desc.getBoolean(idVsbl);
				layerSection = typeIDToStringID(desc.getEnumerationValue(idLayerSection));
				if (layerSection == "layerSectionContent") {
					// select the layer and then retrieve it via Document.activeLayer
					desc.clear();
					desc.putReference(idNull, ref);  
					desc.putBoolean(idMkVs, false);  
					executeAction(idSlct, desc, DialogModes.NO);
					
					var activeLayer = activeDocument.activeLayer;
					layers.push(activeLayer);
					if (layerVisible && visibleInGroup[visibleInGroup.length - 1]) {
						visibleLayers.push(activeLayer);
					}				
				}
				else if (layerSection == "layerSectionStart") {
					visibleInGroup.push(layerVisible && visibleInGroup[visibleInGroup.length - 1]);
				}
				else if (layerSection == "layerSectionEnd") {
					visibleInGroup.pop();
				}
				
				if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
					if (userCancelled) {
						throw new Error("cancel");
					}
				}
			}
			
			// Collect the background.
			ref = new ActionReference();
			ref.putIndex(idLyr, 0);
			try {
				desc = executeActionGet(ref);
				var bg = activeDocument.backgroundLayer;
				layers.push(bg);
				if (bg.visible) {
					visibleLayers.push(bg);
				}
				
				if (progressBarWindow) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
				}
			}
			catch (e) {
				// no background, move on
			}		
		}
		catch (e) {
			if (e.message != "cancel") throw e;
		}

		// restore selection (unfortunately CS2 doesn't support multiselection, so only the topmost layer is re-selected)
		desc.clear();
		ref = new ActionReference();
		const totalLayerCount = selectionDesc.getInteger(charIDToTypeID("Cnt "));
		ref.putIndex(idLyr, selectionDesc.getInteger(charIDToTypeID("ItmI")) - (totalLayerCount - layerCount));
		desc.putReference(idNull, ref);  
		desc.putBoolean(idMkVs, false);  
		executeAction(idSlct, desc, DialogModes.NO);
		
		if (progressBarWindow) {
			progressBarWindow.hide();
		}
	}
		
	return {layers: layers, visibleLayers: visibleLayers};
}

function exportPng24AM(fileName, options)
{
	var desc = new ActionDescriptor(),
		desc2 = new ActionDescriptor();
	desc2.putEnumerated(charIDToTypeID("Op  "), charIDToTypeID("SWOp"), charIDToTypeID("OpSa"));
	desc2.putEnumerated(charIDToTypeID("Fmt "), charIDToTypeID("IRFm"), charIDToTypeID("PN24"));
	desc2.putBoolean(charIDToTypeID("Intr"), options.interlaced);
	desc2.putBoolean(charIDToTypeID("Trns"), options.transparency);
	desc2.putBoolean(charIDToTypeID("Mtt "), true);
	desc2.putInteger(charIDToTypeID("MttR"), options.matteColor.red);
	desc2.putInteger(charIDToTypeID("MttG"), options.matteColor.green);
	desc2.putInteger(charIDToTypeID("MttB"), options.matteColor.blue);
	desc2.putBoolean(charIDToTypeID("SHTM"), false);
	desc2.putBoolean(charIDToTypeID("SImg"), true);
	desc2.putBoolean(charIDToTypeID("SSSO"), false);
	desc2.putList(charIDToTypeID("SSLt"), new ActionList());
	desc2.putBoolean(charIDToTypeID("DIDr"), false);
	desc2.putPath(charIDToTypeID("In  "), new File(fileName));
	desc.putObject(charIDToTypeID("Usng"), stringIDToTypeID("SaveForWeb"), desc2);
	executeAction(charIDToTypeID("Expr"), desc, DialogModes.NO);
}

function exportPng8AM(fileName, options)
{
	var id5 = charIDToTypeID( "Expr" );
	var desc3 = new ActionDescriptor();
	var id6 = charIDToTypeID( "Usng" );
	var desc4 = new ActionDescriptor();
	var id7 = charIDToTypeID( "Op  " );
	var id8 = charIDToTypeID( "SWOp" );
	var id9 = charIDToTypeID( "OpSa" );
	desc4.putEnumerated( id7, id8, id9 );
	var id10 = charIDToTypeID( "Fmt " );
	var id11 = charIDToTypeID( "IRFm" );
	var id12 = charIDToTypeID( "PNG8" );
	desc4.putEnumerated( id10, id11, id12 );
	var id13 = charIDToTypeID( "Intr" ); //Interlaced
	desc4.putBoolean( id13, options.interlaced );
	var id14 = charIDToTypeID( "RedA" );
	var id15 = charIDToTypeID( "IRRd" );
	//Algorithm
	var id16;
	switch (options.colorReduction) {
	
	case ColorReductionType.PERCEPTUAL:
		id16 = charIDToTypeID( "Prcp" );
		break;
		
	case ColorReductionType.SELECTIVE:
		id16 = charIDToTypeID( "Sltv" );
		break;
		
	case ColorReductionType.ADAPTIVE:
		id16 = charIDToTypeID( "Adpt" );
		break;
		
	case ColorReductionType.RESTRICTIVE:
		id16 = charIDToTypeID( "Web " );
		break;

	// CUSTOM not supported
	
	case ColorReductionType.BLACKWHITE:
	case ColorReductionType.GRAYSCALE:
	case ColorReductionType.MACINTOSH:
	case ColorReductionType.WINDOWS:
		id16 = charIDToTypeID( "FlBs" );
		break;
		
	default:
		throw new Error("Unknown color reduction algorithm. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id14, id15, id16 );
    var id361 = charIDToTypeID( "FBPl" );
	switch (options.colorReduction) {
	
	case ColorReductionType.BLACKWHITE:
        desc4.putString( id361, "Black & White" );
		break;
	
	case ColorReductionType.GRAYSCALE:
        desc4.putString( id361, "Grayscale" );
		break;
	
	case ColorReductionType.MACINTOSH:
        desc4.putString( id361, "Mac OS" );
		break;
	
	case ColorReductionType.WINDOWS:
        desc4.putString( id361, "Windows" );
		break;
	}
	var id17 = charIDToTypeID( "RChT" );
	desc4.putBoolean( id17, false );
	var id18 = charIDToTypeID( "RChV" );
	desc4.putBoolean( id18, false );
	var id19 = charIDToTypeID( "AuRd" );
	desc4.putBoolean( id19, false );
	var id20 = charIDToTypeID( "NCol" ); //NO. Of Colors
	desc4.putInteger( id20, options.colors );
	var id21 = charIDToTypeID( "Dthr" ); //Dither
	var id22 = charIDToTypeID( "IRDt" );
	//Dither type
	var id23;
	switch (options.dither) {
	
	case Dither.NONE:
		id23 = charIDToTypeID( "None" );
		break;
	
	case Dither.DIFFUSION:
		id23 = charIDToTypeID( "Dfsn" );
		break;
	
	case Dither.PATTERN:
		id23 = charIDToTypeID( "Ptrn" );
		break;
	
	case Dither.NOISE:
		id23 = charIDToTypeID( "BNoi" );
		break;
	
	default:
		throw new Error("Unknown dither type. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id21, id22, id23 );
	var id24 = charIDToTypeID( "DthA" );
	desc4.putInteger( id24, options.ditherAmount );
	var id25 = charIDToTypeID( "DChS" );
	desc4.putInteger( id25, 0 );
	var id26 = charIDToTypeID( "DCUI" );
	desc4.putInteger( id26, 0 );
	var id27 = charIDToTypeID( "DChT" );
	desc4.putBoolean( id27, false );
	var id28 = charIDToTypeID( "DChV" );
	desc4.putBoolean( id28, false );
	var id29 = charIDToTypeID( "WebS" );
	desc4.putInteger( id29, 0 );
	var id30 = charIDToTypeID( "TDth" ); //transparency dither
	var id31 = charIDToTypeID( "IRDt" );
	var id32;
	switch (options.transparencyDither) {
	
	case Dither.NONE:
		id32 = charIDToTypeID( "None" );
		break;
	
	case Dither.DIFFUSION:
		id32 = charIDToTypeID( "Dfsn" );
		break;
	
	case Dither.PATTERN:
		id32 = charIDToTypeID( "Ptrn" );
		break;
	
	case Dither.NOISE:
		id32 = charIDToTypeID( "BNoi" );
		break;
	
	default:
		throw new Error("Unknown transparency dither algorithm. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id30, id31, id32 );
	var id33 = charIDToTypeID( "TDtA" );
	desc4.putInteger( id33, options.transparencyAmount );
	var id34 = charIDToTypeID( "Trns" ); //Transparency
	desc4.putBoolean( id34, options.transparency );
	var id35 = charIDToTypeID( "Mtt " );
	desc4.putBoolean( id35, true );		 //matte
	var id36 = charIDToTypeID( "MttR" ); //matte color
	desc4.putInteger( id36, options.matteColor.red );
	var id37 = charIDToTypeID( "MttG" );
	desc4.putInteger( id37, options.matteColor.green );
	var id38 = charIDToTypeID( "MttB" );
	desc4.putInteger( id38, options.matteColor.blue );
	var id39 = charIDToTypeID( "SHTM" );
	desc4.putBoolean( id39, false );
	var id40 = charIDToTypeID( "SImg" );
	desc4.putBoolean( id40, true );
	var id41 = charIDToTypeID( "SSSO" );
	desc4.putBoolean( id41, false );
	var id42 = charIDToTypeID( "SSLt" );
	var list1 = new ActionList();
	desc4.putList( id42, list1 );
	var id43 = charIDToTypeID( "DIDr" );
	desc4.putBoolean( id43, false );
	var id44 = charIDToTypeID( "In  " );
	desc4.putPath( id44, new File(fileName) );
	var id45 = stringIDToTypeID( "SaveForWeb" );
	desc3.putObject( id6, id45, desc4 );
	executeAction( id5, desc3, DialogModes.NO );
}

//
// Utilities
//

function padder(input, padLength) 
{
    // pad the input with zeroes up to indicated length
    var result = (new Array(padLength + 1 - input.toString().length)).join('0') + input;
    return result;
}

function formatString(text) 
{
	var args = Array.prototype.slice.call(arguments, 1);
	return text.replace(/\{(\d+)\}/g, function(match, number) { 
			return (typeof args[number] != 'undefined') ? args[number] : match;
		});
}

function loadResource(file)
{
	var rsrcString;
	if (! file.exists) {
		alert("Resource file '" + file.name + "' for the export dialog is missing! Please, download the rest of the files that come with this script.", "Error", true);
		return false;
	}
	try {
		file.open("r");
		if (file.error) throw file.error;
		rsrcString = file.read();
		if (file.error) throw file.error;
		if (! file.close()) {
			throw file.error;
		}
	}
	catch (error) {
		alert("Failed to read the resource file '" + rsrcFile + "'!\n\nReason: " + error + "\n\nPlease, check it's available for reading and redownload it in case it became corrupted.", "Error", true);
		return false;
	}
	
	return rsrcString;
}

function Profiler(enabled)
{
	this.enabled = enabled;
	if (this.enabled) {
		this.startTime = new Date();
		this.lastTime = this.startTime;
	}
}

function defineProfilerMethods()
{
	Profiler.prototype.getDuration = function(rememberAsLastCall, sinceLastCall)
	{
		if (this.enabled) {
			var currentTime = new Date();
			var lastTime = sinceLastCall ? this.lastTime : this.startTime;
			if (rememberAsLastCall) {
				this.lastTime = currentTime;
			}
			return new Date(currentTime.getTime() - lastTime.getTime());
		}
	}
	
	Profiler.prototype.resetLastTime = function()
	{
		this.lastTime = new Date();
	}

	Profiler.prototype.format = function(duration)
	{
		var output = padder(duration.getUTCHours(), 2) + ":";
		output += padder(duration.getUTCMinutes(), 2) + ":";
		output += padder(duration.getUTCSeconds(), 2) + ".";
		output += padder(duration.getUTCMilliseconds(), 3);
		return output;
	}
}
