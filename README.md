Photoshop-Export-Layers-as-Images
=================================

<b>This script allows you to export layers in your Photoshop document as individual images</b> at a speed much faster than the built-in script from Adobe. It also supports PNG. So far it does not feature all the formats that the built-in version does, but more can be added easily upon request. Feel free to contribute to it and make it even more powerful!

This script was originally built as a response to a question on [graphicdesign.stackexchange.com](http://graphicdesign.stackexchange.com/).


Features:
-------------------------------
* Supported export formats:
  * PNG (8 and 24 bit)
  * Targa 
  * JPEG
* Handles nesting in grouped layers.
* Export either all layers or visible only.

Requirements: 
-------------------------------
Adobe Photoshop CS2 or higher.

How To Use: 
-------------------------------
1. Open Photoshop
2. File -> Scripts -> Browse...
3. Locate the file, and open it.


Roadmap:
-------------------------------
* Waive the requirement for the document to be saved and be a PSD. (But check if a document is open, and the script is run in Photoshop(?).)
* Move format specifics to separate files if possible to improve modularity and readability.
* Speed up layer retrieval, hence dialogue start-up.


Version History:
-------------------------------

<b>22 May 2014</b> by [Skjorn](https://github.com/skjorn)

* Added support for Targa (TGA).

<b>2 December 2013</b> by [Justin Wang](http://www.github.com/Tangleworm)

* Added support for both PNG-24 and PNG-8

<b>24 May 2013</b> by [Hanna Walter](http://www.graphicdesign.stackexchange.com/users/408/hanna)

* Nesting properly handled
*  All layers save seperately again (no more stacking).


<b>27 March 2013</b> by [Robin Parmar](http://robinparmar.com/) (robin(at)robinparmar(dot)com)

* preferences stored in object
* auto-increment file names to prevent collisions
* properly handles layer groups
* header added
* code comments added
* main() now has error catcher
* counts number of layers
* many little code improvements


<b>26 Sept 2012</b> by [Hanna Walter](http://www.graphicdesign.stackexchange.com/users/408/hanna)

* Original version


Contact:
-------------------------------
Please use communication channels on GitHub to write feedback/bugs/suggestions: https://github.com/skjorn/Photoshop-Export-Layers-as-Images/issues
