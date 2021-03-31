import os


def validate_image(response, event_id):
    with open(os.getenv('IMAGE_PATH') + "/" + str(event_id) + ".png", mode='rb') as f:
        base_img = f.read()

    assert response.content == base_img
