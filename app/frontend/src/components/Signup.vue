<template>
  <div>
    <h3 class="mb-4">新規ユーザー登録</h3>
    <b-jumbotron class="p-5">
      <b-form v-on:submit.prevent="signup">
        <b-input-group class="mb-4">
          <div class="input-group-prepend">
            <b-input-group-text>
              <b-icon font-scale="1.5" icon="person-fill"></b-icon>
            </b-input-group-text>
          </div>
          <b-input placeholder="ユーザー名を入力してください" required type="text" v-model="formData.username"></b-input>
        </b-input-group>
        <b-input-group class="mb-4">
          <div class="input-group-prepend">
            <b-input-group-text>
              <b-icon font-scale="1.5" icon="key-fill"></b-icon>
            </b-input-group-text>
          </div>
          <b-input placeholder="パスワードを入力してください" required type="password" v-model="formData.password"></b-input>
        </b-input-group>
        <b-form-group class="mb-4">
          <b-form-radio-group :options="roleOptions" required v-model="formData.role"></b-form-radio-group>
        </b-form-group>
        <b-button type="submit" variant="success">
          <b-icon animation="spin" class="mr-1" font-scale="1.5" icon="arrow-clockwise" v-if="submitting"></b-icon>
          新規ユーザー登録
        </b-button>
      </b-form>
    </b-jumbotron>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "Signup",
  data() {
    return {
      roleOptions: [
        { text: "観客", value: "audience" },
        { text: "アーティスト", value: "artist" }
      ],
      formData: {
        username: "",
        password: "",
        role: ""
      },
      submitting: false
    };
  },
  methods: {
    signup() {
      this.submitting = true;

      axios.post(`${this.$apiUrl}/users`, this.formData
      ).then(() => {
        this.$router.push("/login");
      }).catch((error) => {
        this.formData.username = "";
        this.formData.password = "";
        this.formData.role = "";
        console.error(error);
      }).finally(() => {
        this.submitting = false;
      });
    }
  }
};
</script>
