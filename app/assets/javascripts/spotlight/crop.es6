export default class Crop {
  constructor(cropArea) {
    this.cropArea = cropArea;
    this.cropArea.data('iiifCropper', this);
    this.cropSelector = '[data-cropper="' + cropArea.data('cropperKey') + '"]';
    this.cropTool = $(this.cropSelector);
    this.formPrefix = this.cropTool.data('form-prefix');
    this.iiifUrlField = $('#' + this.formPrefix + '_iiif_tilesource');
    this.iiifRegionField = $('#' + this.formPrefix + '_iiif_region');
    this.iiifManifestField = $('#' + this.formPrefix + '_iiif_manifest_url');
    this.iiifCanvasField = $('#' + this.formPrefix + '_iiif_canvas_id');
    this.iiifImageField = $('#' + this.formPrefix + '_iiif_image_id');

    this.form = cropArea.closest('form');
    this.initialCropRegion = [0, 0, cropArea.data('crop-width'), cropArea.data('crop-height')];
    this.tileSource = null;

    this.setupAutoCompletes();
    this.setupAjaxFileUpload();
    this.setupExistingIiifCropper();
    this.invalidateMapSizeOnTabToggle();
  }

  // Set all of the various input fields to
  // the appropriate IIIF URL or identifier
  setIiifFields(iiifObject) {
    this.setTileSource(iiifObject.tilesource);
    this.iiifManifestField.val(iiifObject.manifest);
    this.iiifCanvasField.val(iiifObject.canvasId);
    this.iiifImageField.val(iiifObject.imageId);
  }

  emptyIiifFields() {
    this.iiifManifestField.val('');
    this.iiifCanvasField.val('');
    this.iiifImageField.val('');
  }

  // Set the Crop tileSource and setup the cropper
  setTileSource(source) {
    if (source == this.tileSource) {
      return;
    } else if(this.previousCropBox) {
      this.previousCropBox.remove();
    }

    this.tileSource = source;
    this.iiifUrlField.val(source);
    this.setupIiifCropper();
  }

  // TODO: Add accessors to update hidden inputs with IIIF uri/ids?

  // Setup autocomplete inputs to have the iiif_cropper context
  setupAutoCompletes() {
    var input = $('[data-behavior="autocomplete"]', this.cropTool);
    input.data('iiifCropper', this);
  }

  setupAjaxFileUpload() {
    this.fileInput = $('input[type="file"]', this.cropTool);
    this.fileInput.change(() => this.uploadFile());
  }

  // Setup the cropper on page load if the field
  // that holds the IIIF url is populated
  setupExistingIiifCropper() {
    if(this.iiifUrlField.val() === '') {
      return;
    }

    this.addImageSelectorToExistingCropTool();
    this.setTileSource(this.iiifUrlField.val());
  }

  addImageSelectorToExistingCropTool() {
    if(this.iiifManifestField.val() === '') {
      return;
    }

    var input = $('[data-behavior="autocomplete"]', this.cropTool);
    var panel = $(input.data('target-panel'));
    // This is defined in search_typeahead.js
    addImageSelector(input, panel, this.iiifManifestField.val(), !this.iiifImageField.val());
  }

  setupIiifCropper() {
    if (this.tileSource === null || this.tileSource === undefined) {
      console.error('No tilesource provided when setting up IIIF Cropper');
      return;
    }

    if(this.iiifCropper) {
      this.iiifCropper.removeLayer(this.iiifLayer);
      this.iiifLayer = L.tileLayer.iiif(this.tileSource).addTo(this.iiifCropper);
      return;
    }

    this.iiifCropper = L.map(this.cropArea.attr('id'), {
      center: [0, 0],
      crs: L.CRS.Simple,
      zoom: 0
    });
    this.iiifLayer = L.tileLayer.iiif(this.tileSource, {
      tileSize: 512
    }).addTo(this.iiifCropper);

    this.iiifCropBox = L.areaSelect({
      width: this.cropArea.data('crop-width') / 2,
      height: this.cropArea.data('crop-height') / 2,
      keepAspectRatio: true
    });

    this.iiifCropBox.addTo(this.iiifCropper);

    this.positionIiifCropBox();

    var self = this;
    this.iiifCropBox.on('change', function(){
      var bounds = this.getBounds();
      var zoom = self.iiifCropper.getZoom();
      var min = self.iiifCropper.project(bounds.getSouthWest(), zoom);
      var max = self.iiifCropper.project(bounds.getNorthEast(), zoom);
      var imageSize = self.iiifLayer._imageSizes[zoom];
      var xRatio = self.iiifLayer.x / imageSize.x;
      var yRatio = self.iiifLayer.y / imageSize.y;
      var region = [
        Math.max(Math.floor(min.x * xRatio), 0),
        Math.max(Math.floor(max.y * yRatio), 0),
        Math.min(Math.floor((max.x - min.x) * xRatio), self.iiifLayer.x),
        Math.min(Math.floor((min.y - max.y) * yRatio), self.iiifLayer.y),
      ];
      if (self.existingCropBoxSet) {
        self.iiifRegionField.val(region.join(','));
      }
    });

    this.iiifCropper.on('zoom', function() {
      self.updateIiifCropBox();
    });

    this.cropArea.data('initiallyVisible', this.cropArea.is(':visible'));
  }

  updateIiifCropBox() {
    var regionFieldValue = this.iiifRegionField.val();
    if(!regionFieldValue || regionFieldValue === '') {
      return;
    }

    var maxZoom = this.iiifLayer.maxZoom;
    var currentZoom = this.iiifCropper.getZoom();
    var b = regionFieldValue.split(',');
    var minPoint = L.point(parseInt(b[0]), parseInt(b[1]));
    var maxPoint = L.point(parseInt(b[0]) + parseInt(b[2]), parseInt(b[1]) + parseInt(b[3]));

    var min = this.iiifCropper.unproject(minPoint, maxZoom - currentZoom);
    var max = this.iiifCropper.unproject(maxPoint, maxZoom - currentZoom);

    var y = max.lat - min.lat;
    var x = max.lng - min.lng;

    var size = this.iiifCropper.getSize();

    if (Math.abs(x) > size.x || Math.abs(y) > size.y) {
      return;
    }

    this.iiifCropBox.setDimensions({
      width: Math.round(Math.abs(x)),
      height: Math.round(Math.abs(y))
    });
  }

  positionIiifCropBox() {
    var self = this;
    this.iiifLayer.on('load', function() {
      var regionFieldValue = self.iiifRegionField.val();
      if(!regionFieldValue || regionFieldValue === '' || self.existingCropBoxSet) {
        self.existingCropBoxSet = true;
        return;
      }
      var maxZoom = self.iiifLayer.maxZoom;
      var b = regionFieldValue.split(',');
      var minPoint = L.point(parseInt(b[0]), parseInt(b[1]));
      var maxPoint = L.point(parseInt(b[0]) + parseInt(b[2]), parseInt(b[1]) + parseInt(b[3]));

      var min = self.iiifCropper.unproject(minPoint, maxZoom);
      var max = self.iiifCropper.unproject(maxPoint, maxZoom);

      // Pop a rectangle on there to show where it goes
      var bounds = L.latLngBounds(min, max);
      self.previousCropBox = L.polygon([min, [min.lat, max.lng], max, [max.lat, min.lng]]);
      self.previousCropBox.addTo(self.iiifCropper);
      self.iiifCropper.panTo(bounds.getCenter());

      self.updateIiifCropBox();

      self.existingCropBoxSet = true;
    });
  }

  invalidateMapSizeOnTabToggle() {
    var tabs = $('[role="tablist"]', this.form);
    var self = this;
    tabs.on('shown.bs.tab', function() {
      if(self.cropArea.data('initiallyVisible') === false && self.cropArea.is(':visible')) {
        self.iiifCropper.invalidateSize();
        self.cropArea.data('initiallyVisible', null);
      }
    });
  }

  // Get all the form data with the exception of the _method field.
  getData() {
    var data = new FormData(this.form[0]);
    data.append('_method', null);
    return data;
  }

  uploadFile() {
    var url = this.fileInput.data('endpoint')
    // Every post creates a new image/masthead.
    // Because they create IIIF urls which are heavily cached.
    $.ajax({
      url: url,  //Server script to process data
      type: 'POST',
      success: (data, stat, xhr) => this.successHandler(data, stat, xhr),
      // error: errorHandler,
      // Form data
      data: this.getData(),
      //Options to tell jQuery not to process data or worry about content-type.
      cache: false,
      contentType: false,
      processData: false
    });
  }

  successHandler(data, stat, xhr) {
    this.emptyIiifFields();
    this.setTileSource(data.tilesource);
  }
}
