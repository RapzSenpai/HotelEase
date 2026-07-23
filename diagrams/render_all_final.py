#!/usr/bin/env python3
"""Render all PlantUML diagrams to PNG images."""

import os
from plantuml import PlantUML

# PlantUML server URL
PLANTUML_SERVER = "http://www.plantuml.com/plantuml"

def render_diagrams():
    """Render all .puml files in the diagrams folder."""
    plantuml = PlantUML(url=PLANTUML_SERVER)
    
    diagrams_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(diagrams_dir, "rendered")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Find all .puml files
    puml_files = []
    for root, dirs, files in os.walk(diagrams_dir):
        for file in files:
            if file.endswith('.puml'):
                puml_files.append(os.path.join(root, file))
    
    print(f"Found {len(puml_files)} PlantUML files to render.\n")
    
    success_count = 0
    fail_count = 0
    
    for puml_file in sorted(puml_files):
        # Get relative path for output
        rel_path = os.path.relpath(puml_file, diagrams_dir)
        png_file = os.path.join(output_dir, rel_path.replace('.puml', '.png'))
        
        # Create subdirectory if needed
        os.makedirs(os.path.dirname(png_file), exist_ok=True)
        
        try:
            print(f"Rendering: {rel_path}")
            # Read the PlantUML file
            with open(puml_file, 'r', encoding='utf-8') as f:
                puml_text = f.read()
            
            # Use processes to get the image data
            img_data = plantuml.processes(puml_text)
            
            # Check if we got valid image data
            if img_data and len(img_data) > 100:
                # Check if it's a PNG (starts with PNG header)
                if img_data[:4] == b'\x89PNG':
                    with open(png_file, 'wb') as f:
                        f.write(img_data)
                    print(f"  -> OK ({len(img_data)} bytes)")
                    success_count += 1
                else:
                    # Save whatever we got and check
                    print(f"  WARNING: Got {len(img_data)} bytes but not PNG header: {img_data[:20]}")
                    fail_count += 1
            else:
                print(f"  ERROR: No data returned or too small")
                fail_count += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            fail_count += 1
    
    print(f"\nDone! {success_count} rendered successfully, {fail_count} failed.")
    print(f"Output directory: {output_dir}")

if __name__ == "__main__":
    render_diagrams()
